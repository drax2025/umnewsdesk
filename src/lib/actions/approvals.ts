"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type DecisionKind = "approve" | "reject" | "request_revision";
type ArticleState =
  | "pitched"
  | "commissioned"
  | "filed"
  | "subbed"
  | "legal"
  | "scheduled"
  | "live"
  | "rejected"
  | "killed";

const KINDS: DecisionKind[] = ["approve", "reject", "request_revision"];

const REVALIDATE_PATHS = ["/approvals", "/pipeline", "/board", "/calendar", "/"];

function revalidate(id: string) {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
  revalidatePath(`/articles/${id}`);
  revalidatePath(`/articles/${id}/edit`);
}

// State machine for the review gates.
//
//   approve         reject              request_revision
//   ─────────────────────────────────────────────────────────
//   filed   → subbed   filed   → rejected   filed   → commissioned
//   subbed  → legal    subbed  → rejected   subbed  → filed
//   legal   → scheduled legal  → rejected   legal   → subbed
//
// 'scheduled' here is a logical end-state for the approval workflow; the
// scheduling action is what actually inserts a schedule_entries row.
function nextState(from: ArticleState, kind: DecisionKind): ArticleState | null {
  if (kind === "approve") {
    if (from === "filed") return "subbed";
    if (from === "subbed") return "legal";
    if (from === "legal") return "scheduled";
    return null;
  }
  if (kind === "reject") {
    if (from === "filed" || from === "subbed" || from === "legal") return "rejected";
    return null;
  }
  // request_revision: bounce back one step
  if (from === "filed") return "commissioned";
  if (from === "subbed") return "filed";
  if (from === "legal") return "subbed";
  return null;
}

export async function recordDecision(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("kind") ?? "") as DecisionKind;
  const rationale = String(formData.get("rationale") ?? "").trim();

  if (!id || !KINDS.includes(kind)) return;
  if (rationale.length < 8) return; // require a non-trivial rationale

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("articles")
    .select("state")
    .eq("id", id)
    .single();
  if (!current) return;

  const from = current.state as ArticleState;
  const to = nextState(from, kind);
  if (!to) return;

  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id ?? null;

  // Track the gate clearance columns on approve
  const patch: Record<string, unknown> = { state: to, updated_by: userId };
  if (kind === "approve" && from === "subbed") {
    patch.sub_cleared_at = new Date().toISOString();
    patch.sub_cleared_by = userId;
  }
  if (kind === "approve" && from === "legal") {
    patch.legal_cleared_at = new Date().toISOString();
    patch.legal_cleared_by = userId;
    // 'scheduled' here means: approved for scheduling. We do NOT auto-create
    // a schedule_entries row; the editorial team picks the slot via the
    // calendar surface, which will succeed now that legal_cleared_at is set.
  }

  // Write the audit row FIRST. The approval decision is a precondition for the
  // state transition — if it can't be recorded (missing table, or the
  // admin-only RLS insert policy rejects a non-admin), we must abort before
  // moving the article, not silently advance state with no audit trail.
  const { error: decisionErr } = await supabase
    .from("approval_decisions")
    .insert({
      article_id: id,
      from_state: from,
      to_state: to,
      kind,
      rationale,
      decided_by: userId,
    });
  if (decisionErr) {
    console.error("recordDecision: failed to write approval_decisions", decisionErr);
    throw new Error(`Could not record approval decision: ${decisionErr.message}`);
  }

  const { error: updateErr } = await supabase
    .from("articles")
    .update(patch)
    .eq("id", id);
  if (updateErr) {
    console.error("recordDecision: failed to update article state", updateErr);
    throw new Error(`Decision recorded but article update failed: ${updateErr.message}`);
  }

  revalidate(id);
}
