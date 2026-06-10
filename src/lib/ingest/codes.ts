import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Race-safe code allocators.
 *
 *   REC-YYYY-NNNN  candidates
 *   RR-YYYY-NNNN   sweep_runs
 *   OPS-YYYY-NNNN  ops_rr_alerts
 *   SRC-NNNN       discovery_sources (no year — sources are persistent)
 *
 * Each function calls a Postgres allocator (defined in migration
 * 0010_ingest_code_sequences.sql) that wraps a `nextval()` on a
 * dedicated sequence. nextval is atomic, so concurrent inserts
 * from a batched n8n run never collide on the unique code index.
 */

async function rpc(supabase: SupabaseClient, fn: string): Promise<string> {
  const { data, error } = await supabase.rpc(fn);
  if (error || typeof data !== "string") {
    throw new Error(`${fn}: ${error?.message ?? "unexpected response"}`);
  }
  return data;
}

export async function nextCandidateCode(supabase: SupabaseClient): Promise<string> {
  return rpc(supabase, "next_candidate_code");
}

export async function nextSweepCode(supabase: SupabaseClient): Promise<string> {
  return rpc(supabase, "next_sweep_code");
}

export async function nextAlertCode(supabase: SupabaseClient): Promise<string> {
  return rpc(supabase, "next_alert_code");
}

export async function nextSourceCode(supabase: SupabaseClient): Promise<string> {
  return rpc(supabase, "next_source_code");
}
