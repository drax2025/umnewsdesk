"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  HEADLINE_CHAR_SOFT_CAP,
  MAX_HEADLINE_OPTIONS,
  type HeadlineOption,
} from "@/lib/spec/f3-headlines";

export type ArticleWriteActionResult =
  | { ok: true }
  | { ok: false; error: string };

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

/* -------------------------------------------------------------------------- */
/*  Three-headline set (F3 step 4) + selection (F5 step 1)                    */
/* -------------------------------------------------------------------------- */

const WRITER_STATES = new Set(["commissioned", "filed"]);

async function requireWriter(): Promise<ArticleWriteActionResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string | null }>();
  if (me?.role !== "editor" && me?.role !== "admin") {
    return { ok: false, error: "Editors only" };
  }
  return null;
}

/**
 * Save the three-headline set for an article. Per spec F3 step 4 the Writer
 * produces three options ≤90 chars each, click-bait-leaning per B6.1.
 *
 * Accepts FormData with:
 *   article_id            uuid
 *   option_0_text         string
 *   option_0_rationale    string
 *   option_1_text         string
 *   option_1_rationale    string
 *   option_2_text         string
 *   option_2_rationale    string
 *
 * Empty entries are allowed (Writer mid-drafting). We persist what's given.
 */
export async function saveHeadlineOptions(
  formData: FormData,
): Promise<ArticleWriteActionResult> {
  const denied = await requireWriter();
  if (denied) return denied;

  const articleId = String(formData.get("article_id") ?? "").trim();
  if (!articleId) return { ok: false, error: "Missing article_id" };

  const options: HeadlineOption[] = [];
  for (let i = 0; i < MAX_HEADLINE_OPTIONS; i++) {
    const text = String(formData.get(`option_${i}_text`) ?? "").trim();
    const rationale = String(
      formData.get(`option_${i}_rationale`) ?? "",
    ).trim();
    options.push({
      text,
      rationale,
      char_count: text.length,
    });
  }

  // Reject if any non-empty headline overshoots the soft cap by more than
  // 50% — that's a smell, soft gate stays a warning in the UI.
  for (const o of options) {
    if (o.text.length > HEADLINE_CHAR_SOFT_CAP * 1.5) {
      return {
        ok: false,
        error: `Headline option is ${o.text.length} chars — well past the ${HEADLINE_CHAR_SOFT_CAP}-char soft cap.`,
      };
    }
  }

  const supabase = await createClient();

  // Gate to writer states.
  const { data: current } = await supabase
    .from("articles")
    .select("state")
    .eq("id", articleId)
    .single<{ state: string }>();
  if (!current) return { ok: false, error: "Article not found" };
  if (!WRITER_STATES.has(current.state)) {
    return {
      ok: false,
      error: `Headlines are locked while article is in '${current.state}'.`,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const { error } = await supabase
    .from("articles")
    .update({ headline_options: options, updated_by: userId })
    .eq("id", articleId);
  if (error) return { ok: false, error: error.message };

  revalidate(articleId);
  return { ok: true };
}

/**
 * Select one of the three options as the live headline (F5 step 1).
 *
 * Accepts FormData with:
 *   article_id    uuid
 *   selected_idx  '0' | '1' | '2'
 *
 * Copies headline_options[selected_idx].text into articles.headline so the
 * dossier + downstream agents see the chosen line. Writer states only.
 */
export async function selectHeadline(
  formData: FormData,
): Promise<ArticleWriteActionResult> {
  const denied = await requireWriter();
  if (denied) return denied;

  const articleId = String(formData.get("article_id") ?? "").trim();
  const idxRaw = String(formData.get("selected_idx") ?? "").trim();
  if (!articleId) return { ok: false, error: "Missing article_id" };
  const idx = Number.parseInt(idxRaw, 10);
  if (![0, 1, 2].includes(idx)) {
    return { ok: false, error: "selected_idx must be 0, 1 or 2" };
  }

  const supabase = await createClient();

  type Row = { state: string; headline_options: unknown };
  const { data: current } = await supabase
    .from("articles")
    .select("state, headline_options")
    .eq("id", articleId)
    .single<Row>();
  if (!current) return { ok: false, error: "Article not found" };
  if (!WRITER_STATES.has(current.state)) {
    return {
      ok: false,
      error: `Headline selection is locked while article is in '${current.state}'.`,
    };
  }

  const opts = Array.isArray(current.headline_options)
    ? (current.headline_options as Array<{ text?: unknown }>)
    : [];
  const picked = opts[idx];
  const pickedText =
    picked && typeof picked.text === "string" ? picked.text.trim() : "";
  if (!pickedText) {
    return {
      ok: false,
      error: `Option ${idx + 1} is empty — write a headline first.`,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const { error } = await supabase
    .from("articles")
    .update({
      headline_selected_idx: idx,
      headline: pickedText,
      updated_by: userId,
    })
    .eq("id", articleId);
  if (error) return { ok: false, error: error.message };

  revalidate(articleId);
  return { ok: true };
}
