"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createCrmOrganisation } from "@/lib/crm/agency";

/**
 * Working through the CRM match queue.
 *
 * The queue holds senders the automatic rules would not decide: an ambiguous
 * name, an organisation we hold for another reason, a new sender with nothing
 * in its name to say it is an agency. Nothing was written to the CRM for any
 * of them.
 *
 * Four ways out, and only two of them write:
 *
 *   asAgency   — an agency the rules missed. Client, tagged 'PR Agency'.
 *   asProspect — a business sending its own PR. Not a supplier: a company
 *                worth a sales call, so a prospect with no relationship tag.
 *   ignore     — never an agency, and never ask again (migration 0050).
 *   resolve    — handled by hand in the CRM; just clear the row.
 *
 * Same admin gate as the agency registry beside it.
 */

export type CrmQueueResult = { ok: true; message?: string } | { ok: false; error: string };

type QueueRow = {
  id: number;
  domain: string;
  sender_name: string | null;
  candidate_id: string | null;
  reason: string;
};

/** The From address on the candidate that put this sender in the queue. */
async function emailForCandidate(
  db: ReturnType<typeof createServiceClient>,
  candidateId: string,
): Promise<string | null> {
  const { data } = await db
    .from("candidates").select("raw").eq("id", candidateId)
    .maybeSingle<{ raw: { from_email?: string } | null }>();
  const email = data?.raw?.from_email;
  return typeof email === "string" && email.includes("@") ? email.toLowerCase() : null;
}

async function admin(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return { error: "Only admins can clear the CRM queue" };
  return { userId: user.id };
}

async function close(
  id: number,
  status: "resolved" | "dismissed",
  userId: string,
): Promise<{ error: string } | null> {
  const { error } = await createServiceClient()
    .from("crm_match_queue")
    .update({ status, resolved_by: userId, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "open");
  return error ? { error: error.message } : null;
}

function done(): CrmQueueResult {
  revalidatePath("/team/agencies");
  return { ok: true };
}

/** Handled in the CRM by hand. Clears the row and nothing else. */
export async function resolveCrmMatch(id: number): Promise<CrmQueueResult> {
  const who = await admin();
  if ("error" in who) return { ok: false, error: who.error };
  const failed = await close(id, "resolved", who.userId);
  return failed ? { ok: false, error: failed.error } : done();
}

/**
 * Never an agency. Clears the row and stops the domain queueing again —
 * without which the desk would dismiss the same eighty press offices every
 * few weeks.
 */
export async function ignoreCrmDomain(id: number, reason?: string): Promise<CrmQueueResult> {
  const who = await admin();
  if ("error" in who) return { ok: false, error: who.error };
  const db = createServiceClient();

  const { data: row } = await db
    .from("crm_match_queue").select("domain").eq("id", id).maybeSingle<{ domain: string }>();
  if (!row) return { ok: false, error: "That queue entry has gone" };

  const { error } = await db.from("crm_ignored_domains").upsert(
    { domain: row.domain, reason: reason ?? "not a PR agency", ignored_by: who.userId },
    { onConflict: "domain" },
  );
  if (error) return { ok: false, error: error.message };

  const failed = await close(id, "dismissed", who.userId);
  return failed ? { ok: false, error: failed.error } : done();
}

/** Ignore several at once — the backlog is mostly press offices. */
export async function ignoreCrmDomains(ids: number[]): Promise<CrmQueueResult> {
  const who = await admin();
  if ("error" in who) return { ok: false, error: who.error };
  if (!ids.length) return { ok: false, error: "Nothing selected" };
  const db = createServiceClient();

  const { data: rows } = await db
    .from("crm_match_queue").select("domain").in("id", ids).eq("status", "open")
    .returns<{ domain: string }[]>();
  if (!rows?.length) return { ok: false, error: "Those entries have gone" };

  const { error } = await db.from("crm_ignored_domains").upsert(
    rows.map((r) => ({ domain: r.domain, reason: "not a PR agency", ignored_by: who.userId })),
    { onConflict: "domain" },
  );
  if (error) return { ok: false, error: error.message };

  const { error: closeError } = await db
    .from("crm_match_queue")
    .update({ status: "dismissed", resolved_by: who.userId, resolved_at: new Date().toISOString() })
    .in("id", ids).eq("status", "open");
  if (closeError) return { ok: false, error: closeError.message };

  revalidatePath("/team/agencies");
  return { ok: true, message: `${rows.length} domain${rows.length === 1 ? "" : "s"} will not be asked about again` };
}

/**
 * Write the record the rules would not. `asPrAgency` decides which kind:
 * a supplier who sends us releases, or a business worth selling to.
 */
async function create(
  id: number,
  lifecycle: "prospect" | "client",
  asPrAgency: boolean,
  name?: string,
): Promise<CrmQueueResult> {
  const who = await admin();
  if ("error" in who) return { ok: false, error: who.error };
  const db = createServiceClient();

  const { data: row } = await db
    .from("crm_match_queue")
    .select("id, domain, sender_name, candidate_id, reason")
    .eq("id", id).eq("status", "open").maybeSingle<QueueRow>();
  if (!row) return { ok: false, error: "That queue entry has gone" };

  // The sender's address lives on the candidate that raised the question, not
  // on the queue row. Read it here rather than carrying a second copy that can
  // go stale — every open row could resolve one when this was written.
  const senderEmail = row.candidate_id ? await emailForCandidate(db, row.candidate_id) : null;

  const note = asPrAgency
    ? `Added from the News Desk: sends us press releases (${row.domain}).`
    : `Added from the News Desk: submits its own PR (${row.domain}). Worth a call about marketing or paid PR support.`;

  const chosen = (name ?? "").trim();
  const result = await createCrmOrganisation(db, {
    domain: row.domain,
    // What the desk typed wins. Left alone, the CRM applies its own rule —
    // which is what stops a sender's personal name becoming the record.
    name: chosen || row.sender_name,
    nameIsExplicit: chosen.length > 0,
    lifecycle,
    asPrAgency,
    note,
    candidateId: row.candidate_id,
    contactEmail: senderEmail,
    contactName: row.sender_name,
  });
  if (!result) return { ok: false, error: "The CRM did not answer — nothing was written" };
  if (result.action === "created_untagged") {
    return { ok: false, error: result.reason ?? "Created, but the 'PR Agency' tag failed" };
  }

  const failed = await close(id, "resolved", who.userId);
  if (failed) return { ok: false, error: failed.error };
  revalidatePath("/team/agencies");
  return { ok: true, message: result.changes?.join(", ") || result.action };
}

/** An agency the rules could not spot. Client, tagged 'PR Agency'. */
export async function createCrmAgency(id: number, name?: string): Promise<CrmQueueResult> {
  return create(id, "client", true, name);
}

/** A business that sends its own PR. A prospect for us, not a supplier. */
export async function createCrmProspect(id: number, name?: string): Promise<CrmQueueResult> {
  return create(id, "prospect", false, name);
}
