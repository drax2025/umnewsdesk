import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sequence-style code generators.
 *
 *   REC-YYYY-NNNN  candidates
 *   RR-YYYY-NNNN   sweep_runs
 *   OPS-YYYY-NNNN  ops_rr_alerts
 *   SRC-NNNN       discovery_sources  (no year — sources are persistent)
 *
 * Each function reads the most recent row to derive the next ordinal.
 * Not race-safe under heavy parallelism — fine for sweep cadence,
 * which is bounded. If contention becomes real, swap to a dedicated
 * Postgres sequence per code-family.
 */

function bump(prefix: string, last: string | null, width: number): string {
  const year = new Date().getFullYear();
  if (!last) return `${prefix}-${year}-${"1".padStart(width, "0")}`;
  const m = last.match(/-(\d+)$/);
  const n = m ? Number.parseInt(m[1], 10) + 1 : 1;
  return `${prefix}-${year}-${String(n).padStart(width, "0")}`;
}

function bumpFlat(prefix: string, last: string | null, width: number): string {
  if (!last) return `${prefix}-${"1".padStart(width, "0")}`;
  const m = last.match(/-(\d+)$/);
  const n = m ? Number.parseInt(m[1], 10) + 1 : 1;
  return `${prefix}-${String(n).padStart(width, "0")}`;
}

export async function nextCandidateCode(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("candidates")
    .select("code")
    .order("surfaced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return bump("REC", data?.code ?? null, 4);
}

export async function nextSweepCode(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("sweep_runs")
    .select("code")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return bump("RR", data?.code ?? null, 4);
}

export async function nextAlertCode(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("ops_rr_alerts")
    .select("code")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return bump("OPS", data?.code ?? null, 4);
}

export async function nextSourceCode(supabase: SupabaseClient): Promise<string> {
  // Ordering by code text works because the format is fixed-width SRC-NNNN.
  const { data } = await supabase
    .from("discovery_sources")
    .select("code")
    .order("code", { ascending: false })
    .limit(1)
    .maybeSingle();
  return bumpFlat("SRC", data?.code ?? null, 4);
}
