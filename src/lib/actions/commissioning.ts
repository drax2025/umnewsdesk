"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type CommissionStatus = "briefed" | "accepted" | "declined" | "in_progress" | "filed";

const STATUS_VALUES: CommissionStatus[] = [
  "briefed",
  "accepted",
  "declined",
  "in_progress",
  "filed",
];

const REVALIDATE_PATHS = [
  "/commissioning",
  "/discovery/inbox",
  "/discovery",
  "/pipeline",
  "/",
];

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

function nextCode(prefix: string, last: string | null): string {
  const year = new Date().getFullYear();
  if (!last) return `${prefix}-${year}-001`;
  const m = last.match(/-(\d{3,})$/);
  const n = m ? Number.parseInt(m[1], 10) + 1 : 1;
  return `${prefix}-${year}-${String(n).padStart(3, "0")}`;
}

export async function commissionFromCandidate(formData: FormData) {
  const candidateId = String(formData.get("candidate_id") ?? "");
  if (!candidateId) return;

  const supabase = await createClient();

  const { data: cand } = await supabase
    .from("candidates")
    .select("id, working_headline, source_id, layer")
    .eq("id", candidateId)
    .single();
  if (!cand) return;

  // Default title = first available
  const { data: title } = await supabase
    .from("titles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (!title) return;

  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id ?? null;

  // Create article in 'commissioned' state
  const { data: article, error: artErr } = await supabase
    .from("articles")
    .insert({
      title_id: title.id,
      headline: cand.working_headline,
      state: "commissioned",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (artErr || !article) return;

  // Next commission code
  const { data: lastComm } = await supabase
    .from("commissions")
    .select("code")
    .order("commissioned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const code = nextCode("COM", lastComm?.code ?? null);

  const { data: newComm } = await supabase
    .from("commissions")
    .insert({
      code,
      article_id: article.id,
      candidate_id: candidateId,
      brief: "",
      status: "briefed",
      commissioned_by: userId,
    })
    .select("id")
    .single();

  revalidateAll();
  if (newComm?.id) redirect(`/commissioning/${newComm.id}`);
  redirect("/commissioning");
}

export async function setCommissionStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const target = String(formData.get("status") ?? "") as CommissionStatus;
  const declinedReason = String(formData.get("declined_reason") ?? "").trim() || null;
  if (!id || !STATUS_VALUES.includes(target)) return;

  const supabase = await createClient();

  const patch: Record<string, unknown> = { status: target };
  if (target === "accepted") patch.accepted_at = new Date().toISOString();
  if (target === "declined") patch.declined_reason = declinedReason;
  if (target === "filed") {
    // also bump article to 'filed' state
    const { data: comm } = await supabase
      .from("commissions")
      .select("article_id")
      .eq("id", id)
      .single();
    if (comm) {
      await supabase
        .from("articles")
        .update({ state: "filed" })
        .eq("id", comm.article_id);
    }
  }

  await supabase.from("commissions").update(patch).eq("id", id);
  revalidateAll();
}

export async function updateCommissionBrief(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const brief = String(formData.get("brief") ?? "");
  const deadlineRaw = String(formData.get("deadline_at") ?? "").trim();
  if (!id) return;

  const patch: Record<string, unknown> = { brief };
  if (deadlineRaw) {
    const dt = new Date(deadlineRaw);
    if (!Number.isNaN(dt.getTime())) patch.deadline_at = dt.toISOString();
  } else {
    patch.deadline_at = null;
  }

  const supabase = await createClient();
  await supabase.from("commissions").update(patch).eq("id", id);
  revalidateAll();
}

export async function assignCommission(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const assigneeId = String(formData.get("assignee_id") ?? "").trim() || null;
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("commissions")
    .update({ assignee_id: assigneeId })
    .eq("id", id);
  revalidateAll();
}
