/**
 * One-off: credit orphaned candidates to the outlet that published them.
 *
 * Deleting the Silicon Scotland aggregator set 966 candidates' source_id to
 * null (the FK is `on delete set null`), leaving them with a blank Source in
 * the inbox and unreachable by the Source filter. Their article URLs still say
 * who published them, and several of those outlets are registered — so the
 * attribution can be recovered, and DIGIT and FutureScot material picks up the
 * L4 signal-only classification it should have had all along.
 *
 * Only touches rows with **no** source: an existing attribution is somebody's
 * decision and is left alone.
 *
 *   node --env-file=.env.local scripts/reattribute-by-host.mjs            # dry run
 *   node --env-file=.env.local scripts/reattribute-by-host.mjs --commit
 */
import { createClient } from "@supabase/supabase-js";

const COMMIT = process.argv.includes("--commit");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const host = (u) => {
  if (!u) return null;
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, "") || null; } catch { return null; }
};

const { data: sources } = await sb.from("discovery_sources").select("id, code, layer, stream_id, feed_url");
const index = new Map();
for (const s of sources ?? []) {
  const h = host(s.feed_url);
  if (h && !index.has(h)) index.set(h, s);
}

const { data: rows } = await sb.from("candidates")
  .select("id, code, primary_url, raw").is("source_id", null).limit(2000);
console.log(`${COMMIT ? "COMMIT" : "DRY RUN"} — ${rows?.length ?? 0} candidates with no source\n`);

const byCode = {};
let updated = 0, failed = 0;
for (const c of rows ?? []) {
  const owner = index.get(host(c.primary_url));
  if (!owner) continue;
  byCode[owner.code] = (byCode[owner.code] ?? 0) + 1;
  if (!COMMIT) continue;
  const { error } = await sb.from("candidates").update({
    source_id: owner.id,
    layer: owner.layer,
    stream_id: owner.stream_id,
    // Says how the attribution was arrived at, so it is not mistaken for the
    // feed having delivered it.
    raw: { ...(c.raw ?? {}), attributed_by: "host", reattributed_at: new Date().toISOString() },
  }).eq("id", c.id).is("source_id", null);
  if (error) { failed++; console.error(`  ${c.code}: ${error.message}`); } else updated++;
}
for (const [code, n] of Object.entries(byCode).sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(n).padStart(4)}  ${code}`);
console.log(`\n${COMMIT ? `re-attributed ${updated}` : "would re-attribute " + Object.values(byCode).reduce((a,b)=>a+b,0)} · failed ${failed}`);
if (!COMMIT) console.log("dry run — nothing written. Re-run with --commit.");
