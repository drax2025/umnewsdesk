/**
 * One-off: mirror images for releases ingested before the mirror existed.
 *
 * Image mirroring was deleted with the Postmark path and restored on
 * 3 September 2026, so releases stored in between kept only their attachment
 * filenames. The original mail is still in PR/Ingested, so the pictures can be
 * recovered by matching on Message-ID.
 *
 * Deliberately duplicates the small amount of logic in
 * src/lib/ingest/mirror-attachments.ts rather than importing it: this is a
 * throwaway that runs outside Next, where the "@/" alias does not resolve, and
 * a copy that lives for one afternoon is cheaper than a build step. The
 * constants below must match that file.
 *
 *   node --env-file=.env.local scripts/backfill-attachments.mjs            # dry run
 *   node --env-file=.env.local scripts/backfill-attachments.mjs --commit
 *   ... --limit=5
 */
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const BUCKET = "candidate-attachments";
const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || 50;

const safeKey = (id, name, i) =>
  `${id}/${i}-${String(name).toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-").replace(/^-|-$/g, "").slice(-80) || "image"}`;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Candidates that came with files but have nothing mirrored.
const { data: rows, error } = await sb
  .from("candidates")
  .select("id, code, message_id, working_headline, attachment_urls, attachments")
  .eq("kind", "email")
  .is("attachments", null)
  .not("message_id", "is", null)
  .order("surfaced_at", { ascending: false })
  .limit(LIMIT);
if (error) { console.error("query failed:", error.message); process.exit(1); }

const targets = (rows ?? []).filter((r) => (r.attachment_urls ?? []).length > 0);
console.log(`${COMMIT ? "COMMIT" : "DRY RUN"} — ${targets.length} candidate(s) with files but no mirrored images\n`);
if (!targets.length) process.exit(0);

const byMessageId = new Map(targets.map((r) => [r.message_id, r]));

const client = new ImapFlow({
  host: process.env.IMAP_HOST, port: Number(process.env.IMAP_PORT) || 993, secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
  logger: false, greetingTimeout: 15000, socketTimeout: 120000,
});
client.on("error", (e) => console.error("[IMAP]", e?.message ?? e));

let matched = 0, mirrored = 0, updated = 0;
await client.connect();
try {
  const folder = process.env.IMAP_FOLDER_DONE || "PR/Ingested";
  const lock = await client.getMailboxLock(folder);
  try {
    // Collect UIDs first — acting mid-stream stalls the connection.
    const hits = [];
    for await (const msg of client.fetch({ all: true }, { uid: true, envelope: true })) {
      const id = msg.envelope?.messageId;
      if (id && byMessageId.has(id)) hits.push({ uid: msg.uid, id });
    }
    matched = hits.length;
    console.log(`matched ${matched} of ${targets.length} in ${folder}\n`);

    for (const hit of hits) {
      const row = byMessageId.get(hit.id);
      const raw = await client.download(String(hit.uid), undefined, { uid: true });
      const parsed = await simpleParser(raw.content);
      const out = [];
      for (const [i, att] of (parsed.attachments ?? []).entries()) {
        const type = String(att.contentType ?? "").toLowerCase().split(";")[0].trim();
        if (!IMAGE_TYPES.has(type)) continue;
        const body = att.content;
        if (!body?.length || body.length > MAX_BYTES) continue;
        const name = String(att.filename ?? `image-${i + 1}`).slice(0, 240);
        if (!COMMIT) { out.push({ name, url: null, content_type: type, size: body.length }); continue; }
        const key = safeKey(row.id, name, i);
        const { error: upErr } = await sb.storage.from(BUCKET).upload(key, body, { contentType: type, upsert: true });
        if (upErr) { console.error(`   ${row.code} ${name}: ${upErr.message}`); continue; }
        const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(key);
        out.push({ name, url: pub.publicUrl, content_type: type, size: body.length });
      }
      mirrored += out.length;
      console.log(`${row.code}  ${out.length} image(s)  ${row.working_headline.slice(0, 46)}`);
      for (const a of out) console.log(`   - ${a.name} (${Math.round(a.size / 1024)} KB)`);
      if (COMMIT && out.length) {
        const { error: updErr } = await sb.from("candidates").update({ attachments: out }).eq("id", row.id);
        if (updErr) console.error(`   update failed: ${updErr.message}`); else updated++;
      }
    }
  } finally { lock.release(); }
} finally { await client.logout().catch(() => client.close()); }

console.log(`\nmatched ${matched} · images ${mirrored} · rows updated ${updated}`);
if (!COMMIT) console.log("dry run — nothing uploaded or written. Re-run with --commit.");
