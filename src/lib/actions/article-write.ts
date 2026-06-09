"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const WRITE_PATHS = (id: string) => [
  `/articles/${id}`,
  `/articles/${id}/edit`,
  "/pipeline",
  "/board",
  "/approvals",
  "/commissioning",
  "/",
];

function revalidate(id: string) {
  for (const p of WRITE_PATHS(id)) revalidatePath(p);
}

async function nextRevisionNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  articleId: string,
): Promise<number> {
  const { data } = await supabase
    .from("article_revisions")
    .select("revision_no")
    .eq("article_id", articleId)
    .order("revision_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.revision_no ?? 0) + 1;
}

/**
 * Save a draft of headline/standfirst/body. Patches the article and
 * appends a row to article_revisions so the write history is preserved.
 *
 * Returns silently — the page will revalidate and show the updated state.
 */
export async function saveArticleDraft(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const headlineRaw = String(formData.get("headline") ?? "");
  const standfirstRaw = String(formData.get("standfirst") ?? "");
  const bodyRaw = String(formData.get("body") ?? "");
  const summary = String(formData.get("summary") ?? "").trim() || null;
  if (!id) return;

  const headline = headlineRaw.trim();
  if (!headline) return;

  const standfirst = standfirstRaw.trim() || null;
  const body = bodyRaw === "" ? null : bodyRaw;

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id ?? null;

  await supabase
    .from("articles")
    .update({
      headline,
      standfirst,
      body,
      updated_by: userId,
    })
    .eq("id", id);

  const revNo = await nextRevisionNo(supabase, id);

  await supabase.from("article_revisions").insert({
    article_id: id,
    revision_no: revNo,
    headline,
    standfirst,
    body,
    summary,
    created_by: userId,
  });

  revalidate(id);
}

/**
 * Move an article forward through the review pipeline.
 *
 * Valid transitions:
 *   commissioned → filed   (writer files first draft)
 *   filed        → subbed  (queue picked up for sub-edit) — handled by recordDecision
 *
 * Only handles the writer-initiated 'submit for review' (commissioned → filed).
 * Approval-state transitions live in `approvals.ts`.
 */
export async function submitForReview(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("articles")
    .select("state")
    .eq("id", id)
    .single();

  if (!current) return;
  if (current.state !== "commissioned") return;

  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id ?? null;

  await supabase
    .from("articles")
    .update({ state: "filed", updated_by: userId })
    .eq("id", id);

  // Mirror onto the commission row so the commissioning queue reflects it.
  await supabase
    .from("commissions")
    .update({ status: "filed" })
    .eq("article_id", id);

  revalidate(id);
  redirect(`/articles/${id}`);
}
