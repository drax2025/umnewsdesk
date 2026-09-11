/**
 * One-off: recover releases that arrived as a Word file or a PDF.
 *
 * Some agencies send a two-line covering note with the release attached. Until
 * 11 September 2026 the ingest read the note and stored a few hundred
 * characters of pleasantries — REC-2026-11466 held 429 characters while the
 * release sat in EBCNOMINATIONS2.docx beside it. Eight candidates were in that
 * state, out of 77 carrying a document.
 *
 * The originals are still in PR/Ingested, so the text can be recovered by
 * matching on the Message-ID we stored. Same shape as backfill-eml-bodies.mjs.
 *
 * Touches body_text, summary and two keys under raw. It does not re-push
 * anything already sent to the newsroom — that copy is separate and the script
 * says which rows are in that state.
 *
 *   node --env-file=.env.local scripts/backfill-attachment-bodies.mjs           # dry run
 *   node --env-file=.env.local scripts/backfill-attachment-bodies.mjs --commit
 */
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import mammoth from "mammoth";

const COMMIT = process.argv.includes("--commit");
const THIN = Number(process.argv.find((a) => a.startsWith("--thin="))?.split("=")[1] ?? 600);
const FOLDER = process.argv.find((a) => a.startsWith("--folder="))?.split("=")[1]
  || process.env.IMAP_FOLDER_DONE || "PR/Ingested";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const tidy = (raw) => raw.replace(/\r\n?/g, "\n").replace(/ /g, " ")
  .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

async function readDoc(a) {
  const name = String(a.filename ?? "");
  const type = String(a.contentType ?? "");
  const isDocx = /\.docx$/i.test(name) || /officedocument\.wordprocessingml\.document/i.test(type);
  const isPdf = /\.pdf$/i.test(name) || /^application\/pdf$/i.test(type);
  if ((!isDocx && !isPdf) || !a.content) return null;
  try {
    if (isDocx) return { filename: name, text: tidy((await mammoth.extractRawText({ buffer: a.content })).value ?? "") };
    // pdf-parse 2.x is a class, not a callable default.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(a.content) });
    try {
      const r = await parser.getText();
      return { filename: name, text: tidy(r.text ?? (r.pages ?? []).map((p) => p.text ?? "").join("\n\n")) };
    } finally { await parser.destroy().catch(() => {}); }
  } catch (e) {
    console.log(`     could not read ${name}: ${e.message}`);
    return null;
  }
}

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("candidates")
    .select("id, code, message_id, working_headline, body_text, attachment_urls, raw, newsroom_record_id, triage_state")
    .eq("kind", "email").order("fetched_at", { ascending: false }).range(from, from + 999);
  if (error) { console.error(error.message); break; }
  rows.push(...data);
  if (data.length < 1000) break;
}

const DOC = /\.(docx|pdf)$/i;
const targets = rows.filter((c) =>
  (c.attachment_urls ?? []).some((n) => DOC.test(String(n))) && (c.body_text ?? "").length < THIN);

console.log(`${COMMIT ? "COMMIT" : "DRY RUN"} — ${targets.length} candidate(s) with a document and a body under ${THIN} chars\n`);
if (!targets.length) process.exit(0);
const byId = new Map(targets.filter((c) => c.message_id).map((c) => [c.message_id, c]));

const client = new ImapFlow({
  host: process.env.IMAP_HOST, port: Number(process.env.IMAP_PORT) || 993, secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
  logger: false, socketTimeout: 180000,
});
client.on("error", (e) => console.error("[imap]", e?.message ?? e));

let fixed = 0, pushed = [];
await client.connect();
try {
  const lock = await client.getMailboxLock(FOLDER);
  try {
    const hits = [];
    for await (const m of client.fetch({ all: true }, { uid: true, envelope: true })) {
      const id = m.envelope?.messageId;
      if (id && byId.has(id)) hits.push({ uid: m.uid, id });
    }
    console.log(`matched ${hits.length} of ${byId.size} in ${FOLDER}\n`);

    for (const h of hits) {
      const row = byId.get(h.id);
      const raw = await client.download(String(h.uid), undefined, { uid: true });
      if (!raw?.content) { console.log(`${row.code}: could not download — skipped`); continue; }
      let mail;
      try { mail = await simpleParser(raw.content); }
      catch (e) { console.log(`${row.code}: unparseable — ${e.message}`); continue; }

      // Same ranking as src/lib/ingest/attachment-text.ts: a filename that
      // says "press release" outranks everything, then Word over PDF, then
      // length. REC-2026-11262 has a release and an awards leaflet, and the
      // leaflet is the longer file.
      const NAMED = /(press|media|news)[\s_-]*release|^release\b|\bPR\b/i;
      const rank = (n, docx, len) => (NAMED.test(n) ? 2e6 : 0) + (docx ? 1e6 : 0) + len;
      let best = null, bestRank = -1;
      for (const a of mail.attachments ?? []) {
        const got = await readDoc(a);
        if (!got?.text) continue;
        const score = rank(got.filename, /\.docx$/i.test(got.filename), got.text.length);
        if (score > bestRank) { bestRank = score; best = got; }
      }
      if (!best) { console.log(`${row.code}: no readable document — skipped`); continue; }
      if (best.text.length <= (row.body_text ?? "").length) {
        console.log(`${row.code}: document no better than the mail — skipped`); continue;
      }

      console.log(`${row.code}  body ${(row.body_text ?? "").length} → ${best.text.length}   from ${best.filename}`);
      console.log(`     ${best.text.replace(/\n+/g, " ").slice(0, 110)}…`);
      if (row.newsroom_record_id) pushed.push(row.code);
      if (!COMMIT) continue;

      const { error } = await sb.from("candidates").update({
        body_text: best.text,
        summary: best.text.slice(0, 2000),
        raw: { ...(row.raw ?? {}), body_from_attachment: best.filename, covering_note: (row.body_text ?? "").slice(0, 2000) },
      }).eq("id", row.id);
      if (error) { console.log(`     update failed: ${error.message}`); continue; }
      fixed++;
    }
  } finally { lock.release(); }
} finally { await client.logout().catch(() => {}); }

console.log(`\n${COMMIT ? `repaired ${fixed}` : "dry run — nothing written"}`);
if (pushed.length) {
  console.log(`\n${pushed.length} of these were already sent to the newsroom: ${pushed.join(", ")}`);
  console.log("Their newsroom copy still holds the covering note and needs re-pushing by hand.");
}
