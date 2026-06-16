"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextAlertCode } from "@/lib/ingest/codes";

type TriageState =
  | "ready"
  | "held_dedup"
  | "held_source"
  | "needs_review"
  | "pointer"
  | "sent_to_f1"
  | "escalated"
  | "archived";

const VALID_STATES: TriageState[] = [
  "ready",
  "held_dedup",
  "held_source",
  "needs_review",
  "pointer",
  "sent_to_f1",
  "escalated",
  "archived",
];

const SEVERITIES = new Set(["p1", "p2", "p3"]);
const ISSUE_TYPES = new Set([
  "parse_failure",
  "unreachable",
  "rate_limit",
  "schema_drift",
  "volume_anomaly",
  "wordpress_check",
  "config",
  "timeout",
]);

const SLA_HOURS: Record<string, number> = { p1: 1, p2: 4, p3: 24 };

const REVALIDATE_PATHS = [
  "/discovery/inbox",
  "/discovery",
  "/discovery/ops-rr",
];

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

export async function setCandidateTriage(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const target = String(formData.get("target") ?? "") as TriageState;
  if (!id || !VALID_STATES.includes(target)) {
    console.warn("[inbox] setCandidateTriage rejected", { id, target });
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({ triage_state: target })
    .eq("id", id);
  if (error) {
    // Surface to Vercel logs + throw so the form action shows the
    // failure rather than appearing to no-op. Common cause: the
    // candidate_triage_state enum is missing a value (run the
    // pending 0035_candidate_archived_state migration).
    console.error("[inbox] setCandidateTriage failed", { id, target, error });
    throw new Error(`Could not update candidate (${error.code ?? "?"}): ${error.message}`);
  }

  revalidateAll();
}

/**
 * Soft-delete from the operator inbox. The row stays in the table for
 * audit + future analytics, but disappears from every default view.
 * Reviewers can pull archived items back in via the "Archived" status
 * pill and restore individual rows to `ready`.
 */
export async function dismissCandidate(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) {
    console.warn("[inbox] dismissCandidate rejected: missing id");
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({ triage_state: "archived" })
    .eq("id", id);
  if (error) {
    // Most likely failure mode here: the 0035_candidate_archived_state
    // migration hasn't been applied yet, so Postgres rejects the
    // 'archived' enum value. Throw so we don't pretend it worked.
    console.error("[inbox] dismissCandidate failed", { id, error });
    throw new Error(
      `Could not archive candidate (${error.code ?? "?"}): ${error.message}. ` +
        "If this is a fresh deploy, apply supabase/migrations/0035_candidate_archived_state.sql.",
    );
  }

  revalidateAll();
}

/**
 * Files an OPS-RR alert against the candidate's source and flips the
 * candidate to `escalated`. The description prepends the candidate code
 * + working headline so the alert queue carries enough context to act
 * on without round-tripping back to the inbox.
 */
export async function escalateCandidateToOpsRr(formData: FormData) {
  const candidateId = String(formData.get("id") ?? "");
  const severity = String(formData.get("severity") ?? "p2");
  const issueType = String(formData.get("issue_type") ?? "config");
  const note = String(formData.get("note") ?? "").trim();

  if (!candidateId) return;
  if (!SEVERITIES.has(severity)) return;
  if (!ISSUE_TYPES.has(issueType)) return;
  if (note.length < 4) return;

  const supabase = await createClient();

  const { data: cand } = await supabase
    .from("candidates")
    .select("id, code, source_id, sweep_run_id, working_headline")
    .eq("id", candidateId)
    .single();
  if (!cand || !cand.source_id) return;

  const code = await nextAlertCode(supabase);
  const slaDeadline = new Date(
    Date.now() + (SLA_HOURS[severity] ?? 4) * 3_600_000,
  ).toISOString();

  const description = `${cand.code} — ${cand.working_headline} — ${note}`;

  await supabase.from("ops_rr_alerts").insert({
    code,
    source_id: cand.source_id,
    sweep_run_id: cand.sweep_run_id,
    severity,
    issue_type: issueType,
    status: "open",
    description,
    sla_deadline_at: slaDeadline,
    auto_raised: false,
  });

  await supabase
    .from("candidates")
    .update({ triage_state: "escalated" })
    .eq("id", candidateId);

  revalidateAll();
}
