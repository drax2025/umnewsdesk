/**
 * One-off: repair releases stored before the .eml unwrap existed.
 *
 * Editorial triage forwards a release with the original enclosed as
 * message/rfc822. Until 8 September 2026 the ingest read the covering note and
 * stored ~280 characters of "the original is attached in full", with no agency
 * attribution and no images. The originals are still in PR/Ingested, so the
 * real content can be recovered by matching on the Message-ID we stored.
 *
 * Deliberately leaves `message_id` alone. New ingests key on the *enclosed*
 * id, but rewriting it on an existing row risks colliding with a candidate
 * that already holds it, and the row's identity is not what is broken here.
 *
 *   node --env-file=.env.local scripts/backfill-eml-bodies.mjs            # dry run
 *   node --env-file=.env.local scripts/backfill-eml-bodies.mjs --commit
 */
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const COMMIT = process.argv.includes("--commit");
const BUCKET = "candidate-attachments";
const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const FOLDER = process.argv.find(a=>a.startsWith("--folder="))?.split("=")[1]
  || process.env.IMAP_FOLDER_DONE || "PR/Ingested";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const strip = (html) => html
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&(nbsp|amp|lt|gt|quot|apos|reg|copy|trade|rsquo|lsquo|rdquo|ldquo|ndash|mdash|hellip|pound|euro);/g,
    (_, n) => ({ nbsp:" ", amp:"&", lt:"<", gt:">", quot:'"', apos:"'", reg:"®", copy:"©",
      trade:"™", rsquo:"’", lsquo:"‘", rdquo:"”", ldquo:"“", ndash:"–", mdash:"—",
      hellip:"…", pound:"£", euro:"€" })[n] ?? _)
  .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

const safeKey = (id, name, i) =>
  `${id}/${i}-${String(name).toLowerCase().replace(/[^a-z0-9.\-_]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(-80) || "image"}`;

const { data: rows } = await sb.from("candidates")
  .select("id, code, message_id, working_headline, body_text, attachment_urls, raw, newsroom_record_id")
  .eq("kind", "email").order("surfaced_at", { ascending: false }).limit(300);
const targets = (rows ?? []).filter(c => (c.attachment_urls ?? []).some(n => /\.eml$/i.test(n)));
console.log(`${COMMIT ? "COMMIT" : "DRY RUN"} — ${targets.length} candidate(s) stored from a .eml wrapper\n`);
if (!targets.length) process.exit(0);
const byId = new Map(targets.map(c => [c.message_id, c]));

const client = new ImapFlow({ host: process.env.IMAP_HOST, port: Number(process.env.IMAP_PORT)||993,
  secure: true, auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
  logger: false, socketTimeout: 180000 });
client.on("error", e => console.error("[imap]", e?.message ?? e));

let fixed = 0, images = 0;
await client.connect();
try {
  // Folder is selectable: a repaired candidate whose message is still in the
  // watched folder would otherwise be re-polled and, because the fix keys on
  // the *enclosed* Message-ID, arrive again as a second candidate.
  const lock = await client.getMailboxLock(FOLDER);
  try {
    const hits = [];
    for await (const m of client.fetch({ all: true }, { uid: true, envelope: true })) {
      const id = m.envelope?.messageId;
      if (id && byId.has(id)) hits.push({ uid: m.uid, id });
    }
    console.log(`matched ${hits.length} of ${targets.length} in the folder\n`);
    for (const h of hits) {
      const row = byId.get(h.id);
      const raw = await client.download(String(h.uid), undefined, { uid: true });
      // A message the server will not hand over must not end the run: the
      // first attempt lost the remaining candidates to an unguarded throw.
      if (!raw?.content) { console.log(`${row.code}: could not download — skipped`); continue; }
      let outer;
      try { outer = await simpleParser(raw.content); }
      catch (e) { console.log(`${row.code}: unparseable — ${e.message}`); continue; }
      const eml = (outer.attachments ?? []).find(a =>
        /message\/rfc822/i.test(String(a.contentType ?? "")) || /\.eml$/i.test(String(a.filename ?? "")));
      if (!eml?.content) { console.log(`${row.code}: no enclosed message — skipped`); continue; }
      const inner = await simpleParser(eml.content);
      const text = typeof inner.text === "string" && inner.text.trim().length >= 50
        ? inner.text.trim() : strip(typeof inner.html === "string" ? inner.html : "");
      if (!text || text.length <= (row.body_text?.length ?? 0)) {
        console.log(`${row.code}: enclosed body no better — skipped`); continue;
      }
      const from = inner.from?.value?.[0]?.address?.toLowerCase() ?? null;
      const domain = from?.split("@")[1] ?? "";
      const { data: agency } = domain
        ? await sb.from("press_agencies").select("id, name, source_id, trust_tier").contains("email_domains",[domain]).maybeSingle()
        : { data: null };
      const names = (inner.attachments ?? []).map(a => String(a.filename ?? "").slice(0,240)).filter(Boolean).slice(0,20);
      console.log(`${row.code}  body ${row.body_text?.length ?? 0} → ${text.length}  from ${from}  agency ${agency?.name ?? "—"}`);
      console.log(`     subject: ${String(inner.subject ?? "").slice(0,64)}`);
      if (!COMMIT) continue;

      const mirrored = [];
      for (const [i, a] of (inner.attachments ?? []).entries()) {
        const type = String(a.contentType ?? "").toLowerCase().split(";")[0].trim();
        if (!IMAGE_TYPES.has(type) || !a.content?.length || a.content.length > MAX_BYTES) continue;
        const name = String(a.filename ?? `image-${i+1}`).slice(0,240);
        const key = safeKey(row.id, name, i);
        const { error } = await sb.storage.from(BUCKET).upload(key, a.content, { contentType: type, upsert: true });
        if (error) { console.error(`     image ${name}: ${error.message}`); continue; }
        const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(key);
        mirrored.push({ name, url: pub.publicUrl, content_type: type, size: a.content.length });
      }
      images += mirrored.length;

      const patch = {
        working_headline: String(inner.subject ?? row.working_headline).slice(0,400),
        body_text: text.slice(0,100_000),
        summary: text.slice(0,2000),
        author: inner.from?.value?.[0]?.name ?? null,
        published_at: inner.date ? new Date(inner.date).toISOString() : null,
        attachment_urls: names,
        verification_state: agency ? "verified" : "unverified",
        pr_contact: { name: inner.from?.value?.[0]?.name ?? null, email: from },
        raw: { ...(row.raw ?? {}), from_email: from, from_domain: domain,
               agency_id: agency?.id ?? null, agency_name: agency?.name ?? null,
               agency_match: agency ? "envelope" : null, trust_tier: agency?.trust_tier ?? null,
               forwarded_by: row.raw?.from_email ?? null, unwrapped_from_eml: true,
               backfilled_at: new Date().toISOString() },
        ...(agency?.source_id ? { source_id: agency.source_id } : {}),
        ...(mirrored.length ? { attachments: mirrored } : {}),
      };
      // Align identity with the enclosed message, so the same release polled
      // again dedups instead of arriving twice. Skipped if another row already
      // holds that id.
      const innerId = String(inner.messageId ?? "").trim();
      if (innerId && innerId !== row.message_id) {
        const { data: clash } = await sb.from("candidates").select("id").eq("message_id", innerId).maybeSingle();
        if (!clash) patch.message_id = innerId;
        else console.log("     enclosed id already held by another row — left as is");
      }
      const { error: uErr } = await sb.from("candidates").update(patch).eq("id", row.id);
      if (uErr) console.error(`     update failed: ${uErr.message}`);
      else { fixed++; console.log(`     updated${mirrored.length ? ` (+${mirrored.length} image)` : ""}`); }
    }
  } finally { lock.release(); }
} finally { await client.logout().catch(()=>client.close()); }
console.log(`\nrepaired ${fixed} · images ${images}`);
if (!COMMIT) console.log("dry run — nothing written. Re-run with --commit.");
