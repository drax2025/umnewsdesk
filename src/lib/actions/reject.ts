"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateRejection } from "@/lib/spec/rejection";

/**
 * Rejecting candidates.
 *
 * Single and bulk both go through `reject_candidate` in the database, once per
 * candidate. That is slower than a set-based update and it means a bulk run can
 * fail part-way — but it keeps one write path, so the permission check, the
 * attribution and the COALESCE'd timestamp cannot drift between the two. A
 * second path would be a second place for those rules to live, and therefore a
 * second place for them to be wrong.
 */

export type RejectResult =
  | { ok: true; rejected: number }
  | { ok: false; error: string; rejected: number };

const PATHS = ["/discovery/inbox", "/discovery"];

async function rejectMany(
  ids: string[],
  reason: string,
  note: string,
): Promise<RejectResult> {
  const invalid = validateRejection(reason, note);
  if (invalid) return { ok: false, error: invalid, rejected: 0 };
  if (ids.length === 0) return { ok: false, error: "Nothing selected", rejected: 0 };

  const supabase = await createClient();
  const cleanNote = String(note ?? "").trim() || null;

  let rejected = 0;
  for (const id of ids) {
    const { error } = await supabase.rpc("reject_candidate", {
      p_id: id,
      p_reason: reason,
      p_note: cleanNote,
    });
    if (error) {
      // Stop at the first failure and report how far we got. The alternative —
      // pressing on — turns one clear problem into a scattered one.
      console.error("[reject] failed", { id, error });
      const hint =
        error.code === "PGRST202" || /reject_candidate/.test(error.message)
          ? " Apply supabase/migrations/0046 and 0047 if this is a fresh deploy."
          : "";
      return {
        ok: false,
        rejected,
        error:
          rejected > 0
            ? `Rejected ${rejected} of ${ids.length}, then stopped: ${error.message}.${hint}`
            : `${error.message}${hint}`,
      };
    }
    rejected++;
  }

  for (const p of PATHS) revalidatePath(p);
  return { ok: true, rejected };
}

/** One candidate, from the row action. */
export async function rejectCandidate(
  candidateId: string,
  reason: string,
  note: string,
): Promise<RejectResult> {
  return rejectMany([candidateId], reason, note);
}

/** A batch, from the selection bar. One reason and one note for all of them. */
export async function rejectCandidates(
  candidateIds: string[],
  reason: string,
  note: string,
): Promise<RejectResult> {
  return rejectMany(candidateIds, reason, note);
}
