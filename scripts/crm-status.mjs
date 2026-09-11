/**
 * What the CRM integration has done so far.
 *
 * Reads the three tables 0049 added. With CRM_WRITE_ENABLED off every row in
 * crm_sync_log is a dry run — what would have happened — which is the thing to
 * read before turning writes on.
 *
 *   node --env-file=.env.local scripts/crm-status.mjs
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function all(table, select, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select).range(from, from + 999);
    if (order) q = q.order(order, { ascending: false });
    const { data, error } = await q;
    if (error) return { error: error.message, rows: [] };
    out.push(...data);
    if (data.length < 1000) return { rows: out };
  }
}

const cache = await all("crm_agency_cache", "domain, crm_org_id, name, lifecycle, is_pr_agency, matched_by");
const log = await all("crm_sync_log", "happened_at, domain, sender_name, action, reason, changes, dry_run", "happened_at");
const queue = await all("crm_match_queue", "domain, sender_name, reason, status, created_at", "created_at");

for (const [label, r] of [["crm_agency_cache", cache], ["crm_sync_log", log], ["crm_match_queue", queue]]) {
  if (r.error) console.log(`${label}: ERROR — ${r.error}`);
}

console.log(`crm_agency_cache — ${cache.rows.length} row(s)`);
if (cache.rows.length) {
  const hits = cache.rows.filter((r) => r.crm_org_id);
  console.log(`  ${hits.length} matched in the CRM (${hits.filter((r) => r.is_pr_agency).length} tagged PR Agency), ${cache.rows.length - hits.length} cached misses`);
  for (const r of hits.slice(0, 15)) {
    console.log(`    ${r.domain.padEnd(32)} ${r.name ?? "?"} · ${r.lifecycle ?? "?"} · via ${r.matched_by ?? "?"}`);
  }
}

console.log(`\ncrm_sync_log — ${log.rows.length} row(s)`);
if (log.rows.length) {
  const byAction = {};
  for (const r of log.rows) byAction[r.action] = (byAction[r.action] ?? 0) + 1;
  console.log(`  ${Object.entries(byAction).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a}=${n}`).join("  ")}`);
  const live = log.rows.filter((r) => !r.dry_run);
  console.log(`  ${log.rows.length - live.length} dry run, ${live.length} written to the CRM for real`);
  for (const r of log.rows.slice(0, 20)) {
    const when = new Date(r.happened_at).toLocaleString("en-GB", { timeZone: "Europe/London" });
    console.log(`    ${when}  ${r.action.padEnd(14)} ${(r.domain ?? "").padEnd(30)} ${r.reason ?? (r.changes ?? []).join(", ")}`);
  }
}

console.log(`\ncrm_match_queue — ${queue.rows.filter((r) => r.status === "open").length} open of ${queue.rows.length}`);
for (const r of queue.rows.filter((r) => r.status === "open").slice(0, 20)) {
  console.log(`    ${r.domain.padEnd(32)} ${r.reason}`);
}
