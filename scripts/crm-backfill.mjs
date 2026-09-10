/**
 * Catch the CRM up on every agency that mailed us before the integration
 * existed.
 *
 * Ongoing, ensureCrmAgency runs once per ingest. This walks the sender domains
 * already in candidates and applies the same rules to them, so the CRM reflects
 * the whole history rather than only what has arrived since deploy.
 *
 * Dry by default — it prints what it would do and writes nothing, to either
 * database. --live applies it and records every call in crm_sync_log, with
 * anything the CRM would not decide going to crm_match_queue.
 *
 *   CRM_API_SECRET=... node --env-file=.env.local scripts/crm-backfill.mjs
 *   CRM_API_SECRET=... node --env-file=.env.local scripts/crm-backfill.mjs --live
 *
 * Safe to re-run: the CRM matches on domain before it creates anything, so a
 * second pass reports "none" for everything the first pass made.
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

const LIVE = process.argv.includes("--live");
const URL_ = process.env.CRM_API_URL || "https://crm.unionmediainc.com/api/desk/agency";
const SECRET = process.env.CRM_API_SECRET;
if (!SECRET) {
  console.error("CRM_API_SECRET is not set — read it from the VPS rather than pasting it.");
  process.exit(1);
}

const INTERNAL = (process.env.INTERNAL_DOMAINS || "unionmedia.news,unionmedianews.com,unionmediainc.com")
  .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function crm(domain, name) {
  const raw = JSON.stringify({ op: "ensure", domain, name, dryRun: !LIVE, ts: Date.now() });
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-desk-signature": "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex"),
    },
    body: raw,
  });
  const text = await res.text();
  if (!res.ok && res.status !== 207) return { ok: false, error: `HTTP ${res.status} ${text.slice(0, 120)}` };
  try { return JSON.parse(text); } catch { return { ok: false, error: "unparseable response" }; }
}

// Newest first, so the name we carry for a domain is the one it signed with most recently.
const senders = new Map();
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("candidates")
    .select("id, raw, pr_contact, author, fetched_at")
    .eq("kind", "email")
    .order("fetched_at", { ascending: false })
    .range(from, from + 999);
  if (error) { console.error(error.message); break; }
  for (const c of data) {
    const d = c.raw?.from_domain?.toLowerCase?.().trim();
    if (!d || INTERNAL.includes(d)) continue;
    if (!senders.has(d)) senders.set(d, { domain: d, name: c.pr_contact?.name ?? c.author ?? null, candidateId: c.id, count: 0 });
    senders.get(d).count++;
  }
  if (data.length < 1000) break;
}

console.log(`${senders.size} sender domain(s) to check — ${LIVE ? "WRITING to the CRM" : "dry run, nothing will be written"}\n`);

const byAction = new Map();
for (const s of senders.values()) {
  const r = await crm(s.domain, s.name);
  if (!r?.ok) {
    console.log(`  ERROR  ${s.domain} — ${r?.error ?? "no answer"}`);
    byAction.set("error", [...(byAction.get("error") ?? []), s.domain]);
    continue;
  }
  const detail = (r.changes ?? []).join(", ") || r.reason || "";
  byAction.set(r.action, [...(byAction.get(r.action) ?? []), `${s.domain.padEnd(32)} ${detail}`]);

  if (LIVE) {
    await sb.from("crm_sync_log").insert({
      domain: s.domain, sender_name: s.name, candidate_id: s.candidateId,
      action: r.action, reason: r.reason ?? null, changes: r.changes ?? [],
      crm_org_id: r.org?.id && r.org.id !== "(new)" ? r.org.id : null, dry_run: false,
    });
    if (r.action === "needs_review") {
      const { error } = await sb.from("crm_match_queue").insert({
        domain: s.domain, sender_name: s.name, candidate_id: s.candidateId,
        reason: r.reason ?? "the CRM could not decide",
        candidates: (r.ambiguous ?? []).concat(r.org ? [r.org] : []),
      });
      if (error && error.code !== "23505") console.error(`  queue insert failed for ${s.domain}: ${error.message}`);
    }
    if (r.org && r.org.id !== "(new)") {
      await sb.from("crm_agency_cache").upsert({
        domain: s.domain, crm_org_id: r.org.id, name: r.org.name, lifecycle: r.org.lifecycle,
        is_pr_agency: r.org.isPrAgency ?? false, matched_by: r.action === "created" ? "created" : null,
        synced_at: new Date().toISOString(),
      }, { onConflict: "domain" });
    }
  }
}

for (const action of ["created", "would_create", "promoted", "would_promote", "needs_review", "none", "ignored", "created_untagged", "error"]) {
  const rows = byAction.get(action);
  if (!rows?.length) continue;
  console.log(`── ${action.toUpperCase()} — ${rows.length}`);
  for (const r of rows) console.log(`   ${r}`);
  console.log();
}
