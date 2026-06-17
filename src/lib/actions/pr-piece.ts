import { createServiceClient } from "@/lib/supabase/service";

/**
 * A "PR piece" is a candidate triaged as production option 1 (Direct Publish)
 * or 2 (AI Rewrite) — submitted content, as opposed to option 3 (Value Added /
 * sourced editorial). PR pieces are routine pass-throughs, so the F6 and F7
 * verdict screens don't force a rationale on them.
 *
 * Resolved via the article → commission → candidate join (the canonical
 * pattern in this codebase). Returns false if the chain breaks or the
 * candidate hasn't been triaged.
 *
 * Not a server action — a server-side helper imported by the F6/F7 actions.
 */
export async function isPrPiece(articleId: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data: comm } = await admin
    .from("commissions")
    .select("candidate_id")
    .eq("article_id", articleId)
    .maybeSingle<{ candidate_id: string | null }>();
  if (!comm?.candidate_id) return false;
  const { data: cand } = await admin
    .from("candidates")
    .select("production_option")
    .eq("id", comm.candidate_id)
    .maybeSingle<{ production_option: number | null }>();
  return cand?.production_option === 1 || cand?.production_option === 2;
}
