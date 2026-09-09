"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Closing an entry in the CRM match queue.
 *
 * The queue holds senders the CRM would not decide on its own — an ambiguous
 * name, an organisation we hold for another reason, a new sender that does not
 * read as an agency. Nothing was written to the CRM for any of them.
 *
 * Neither action here writes to the CRM either. The record is made in the CRM
 * itself, by a person, and this only clears the reminder — so a mistake costs
 * a row in a queue rather than a wrong client record in someone else's
 * database. Same admin gate as the agency registry beside it.
 */

export type CrmQueueResult = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<CrmQueueResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (me?.role !== "admin") return { ok: false, error: "Only admins can clear the CRM queue" };
  return null;
}

async function close(id: number, status: "resolved" | "dismissed"): Promise<CrmQueueResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await createServiceClient()
    .from("crm_match_queue")
    .update({ status, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "open");

  if (error) return { ok: false, error: error.message };
  revalidatePath("/team/agencies");
  return { ok: true };
}

/** Handled — the record was created or corrected in the CRM. */
export async function resolveCrmMatch(id: number): Promise<CrmQueueResult> {
  return close(id, "resolved");
}

/** Not an agency, or not worth a record. The domain can queue again if it mails again. */
export async function dismissCrmMatch(id: number): Promise<CrmQueueResult> {
  return close(id, "dismissed");
}
