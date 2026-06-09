import type { SupabaseClient } from "@supabase/supabase-js";

type DedupInput = {
  source_id: string;
  external_id: string | null;
  primary_url_canonical: string | null;
  headline_normalized: string;
};

export type DedupOutcome =
  | { state: "clear" }
  | { state: "duplicate"; matched_candidate_id: string; reason: "external_id" | "primary_url" | "fuzzy_headline" };

/**
 * Three-pass dedup:
 *
 *   1. Exact (source_id, external_id) — same item from the same feed.
 *   2. Exact canonical primary_url — same URL surfaced via a different feed.
 *   3. Fuzzy headline similarity (pg_trgm) within the last 14 days.
 *
 * First hit wins. Returns the matched candidate id so the caller can
 * link the duplicate for audit.
 */
export async function checkDedup(
  supabase: SupabaseClient,
  input: DedupInput,
): Promise<DedupOutcome> {
  // 1. external_id match within the same source
  if (input.external_id) {
    const { data } = await supabase
      .from("candidates")
      .select("id")
      .eq("source_id", input.source_id)
      .eq("external_id", input.external_id)
      .limit(1)
      .maybeSingle();
    if (data) {
      return { state: "duplicate", matched_candidate_id: data.id, reason: "external_id" };
    }
  }

  // 2. canonical URL match across any source
  if (input.primary_url_canonical) {
    const { data } = await supabase
      .from("candidates")
      .select("id")
      .eq("primary_url", input.primary_url_canonical)
      .limit(1)
      .maybeSingle();
    if (data) {
      return { state: "duplicate", matched_candidate_id: data.id, reason: "primary_url" };
    }
  }

  // 3. fuzzy headline within 14d (pg_trgm similarity ≥ 0.6)
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: recent } = await supabase
    .from("candidates")
    .select("id, working_headline")
    .gte("surfaced_at", since)
    .limit(250);

  if (recent && recent.length > 0) {
    const needle = input.headline_normalized;
    for (const cand of recent) {
      const hay = normalizeQuick(cand.working_headline);
      if (similarity(needle, hay) >= 0.82) {
        return { state: "duplicate", matched_candidate_id: cand.id, reason: "fuzzy_headline" };
      }
    }
  }

  return { state: "clear" };
}

// Cheap in-memory dedup helpers — match the normalize.ts logic but
// avoid pulling pg_trgm into the request path. Postgres still gets to
// use its index for the SELECT above, this is just final-mile scoring.

function normalizeQuick(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an)\s+/, "");
}

// Jaccard similarity over 3-char shingles. Cheap, no deps,
// well-correlated with what pg_trgm computes.
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const sa = shingles(a, 3);
  const sb = shingles(b, 3);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function shingles(s: string, n: number): Set<string> {
  const out = new Set<string>();
  const padded = ` ${s} `;
  for (let i = 0; i <= padded.length - n; i++) {
    out.add(padded.slice(i, i + n));
  }
  return out;
}
