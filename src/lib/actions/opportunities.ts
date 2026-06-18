"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  OPPORTUNITY_SECTIONS,
  OPPORTUNITY_VERDICTS,
  REJECT_SWEEP_VERDICTS,
  type OpportunitySection,
  type OpportunityVerdict,
  type RejectSweepVerdict,
} from "@/lib/spec/a3-opportunities";

/**
 * A3 / K5 server actions.
 *
 *   addOpportunity(fd)             — title-scoped manual entry
 *                                    (B7 surface already inserts the
 *                                    article-scoped rows during research)
 *   setOpportunityVerdict(fd)      — K5 Friday sweep stamp (commission /
 *                                    park / drop) + sweep_count bump
 *   updateOpportunity(fd)          — edit headline / section / category /
 *                                    priority / notes
 *   deleteOpportunity(fd)          — admin cleanup
 *   bumpOpportunitySweep(fd)       — bumps sweep_count without verdict
 *                                    (used by 'mark as reviewed' button)
 *   setRejectSweepVerdict(fd)      — K5 PURSUE / HOLD / DROP on a rejected
 *                                    article. Appends a new row, never
 *                                    overwrites — per-iteration audit.
 */

export type OpportunityActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const SECTION_SET = new Set<OpportunitySection>(
  OPPORTUNITY_SECTIONS.map((s) => s.value),
);
const VERDICT_SET = new Set<OpportunityVerdict>(
  OPPORTUNITY_VERDICTS.map((v) => v.value),
);
const REJECT_VERDICT_SET = new Set<RejectSweepVerdict>(
  REJECT_SWEEP_VERDICTS.map((v) => v.value),
);

async function requireEditor(): Promise<OpportunityActionResult | null> {
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

async function requireSeniorEditor(): Promise<OpportunityActionResult | null> {
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
  if (me?.role !== "admin") {
    return { ok: false, error: "Admin only" };
  }
  return null;
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function trimOrNull(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseSection(raw: unknown): OpportunitySection | null {
  const s = String(raw ?? "").trim();
  return SECTION_SET.has(s as OpportunitySection)
    ? (s as OpportunitySection)
    : null;
}

function parseVerdict(raw: unknown): OpportunityVerdict | null {
  const s = String(raw ?? "").trim();
  return VERDICT_SET.has(s as OpportunityVerdict)
    ? (s as OpportunityVerdict)
    : null;
}

function parseRejectVerdict(raw: unknown): RejectSweepVerdict | null {
  const s = String(raw ?? "").trim();
  return REJECT_VERDICT_SET.has(s as RejectSweepVerdict)
    ? (s as RejectSweepVerdict)
    : null;
}

function parsePriority(raw: unknown): 1 | 2 | 3 | null {
  const n = Number(raw);
  return n === 1 || n === 2 || n === 3 ? (n as 1 | 2 | 3) : null;
}

function revalidate(articleId?: string) {
  revalidatePath("/opportunities");
  revalidatePath("/queues/reject");
  if (articleId) {
    revalidatePath(`/articles/${articleId}`);
    revalidatePath(`/articles/${articleId}/research`);
  }
}

/* -------------------------------------------------------------------------- */
/*  addOpportunity — manual (title-level) creation                            */
/* -------------------------------------------------------------------------- */

export async function addOpportunity(
  fd: FormData,
): Promise<OpportunityActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const title_id = String(fd.get("title_id") ?? "").trim();
  const sourceArticle = String(fd.get("source_article_id") ?? "").trim();
  const title = trimOrNull(fd.get("title"), 240);
  const section = parseSection(fd.get("section")) ?? "b_followup";
  const category = trimOrNull(fd.get("category"), 120);
  const priority = parsePriority(fd.get("priority"));
  const notes = trimOrNull(fd.get("notes"), 1200);

  if (!title_id) return { ok: false, error: "Pick a title." };
  if (!title) return { ok: false, error: "Title required." };

  const admin = createServiceClient();
  const uid = await currentUserId();

  // For title-level manual entries we still want a valid article_id, since
  // the original column is NOT NULL. Pick the most-recent published
  // article in this title as a parent if no source article was provided.
  let articleId = sourceArticle || null;
  if (!articleId) {
    const { data: latest } = await admin
      .from("articles")
      .select("id")
      .eq("title_id", title_id)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    articleId = latest?.id ?? null;
  }
  if (!articleId) {
    return {
      ok: false,
      error:
        "This title has no articles yet — can't anchor a manual opportunity.",
    };
  }

  const { data, error } = await admin
    .from("article_pipeline_opportunities")
    .insert({
      article_id: articleId,
      title_id,
      section,
      title,
      category,
      priority,
      notes,
      created_by: uid,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };

  revalidate(articleId);
  return { ok: true, id: data?.id };
}

/* -------------------------------------------------------------------------- */
/*  setOpportunityVerdict — K5 Friday sweep stamp                             */
/* -------------------------------------------------------------------------- */

export async function setOpportunityVerdict(
  fd: FormData,
): Promise<OpportunityActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  const verdict = parseVerdict(fd.get("verdict"));
  const notes = trimOrNull(fd.get("verdict_notes"), 1200);

  if (!id) return { ok: false, error: "Missing id" };
  if (!verdict) return { ok: false, error: "Pick a verdict" };
  if ((verdict === "drop" || verdict === "park") && !notes) {
    return {
      ok: false,
      error: "Drop and Park need a note for the K5 audit trail.",
    };
  }

  const admin = createServiceClient();
  const uid = await currentUserId();
  const now = new Date().toISOString();

  // Read sweep_count for the bump.
  const { data: existing } = await admin
    .from("article_pipeline_opportunities")
    .select("sweep_count, article_id")
    .eq("id", id)
    .maybeSingle<{ sweep_count: number; article_id: string }>();

  const { error } = await admin
    .from("article_pipeline_opportunities")
    .update({
      verdict,
      verdict_at: now,
      verdict_by: uid,
      verdict_notes: notes,
      sweep_count: (existing?.sweep_count ?? 0) + 1,
      last_swept_at: now,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidate(existing?.article_id);
  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/*  bumpOpportunitySweep — touch without verdict                              */
/* -------------------------------------------------------------------------- */

export async function bumpOpportunitySweep(
  fd: FormData,
): Promise<OpportunityActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id" };

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("article_pipeline_opportunities")
    .select("sweep_count, article_id")
    .eq("id", id)
    .maybeSingle<{ sweep_count: number; article_id: string }>();

  const { error } = await admin
    .from("article_pipeline_opportunities")
    .update({
      sweep_count: (existing?.sweep_count ?? 0) + 1,
      last_swept_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidate(existing?.article_id);
  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/*  updateOpportunity                                                         */
/* -------------------------------------------------------------------------- */

export async function updateOpportunity(
  fd: FormData,
): Promise<OpportunityActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id" };

  const title = trimOrNull(fd.get("title"), 240);
  const section = parseSection(fd.get("section"));
  const category = trimOrNull(fd.get("category"), 120);
  const priority = parsePriority(fd.get("priority"));
  const notes = trimOrNull(fd.get("notes"), 1200);

  if (!title) return { ok: false, error: "Title required." };
  if (!section) return { ok: false, error: "Pick a section." };

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_pipeline_opportunities")
    .update({
      title,
      section,
      category,
      priority,
      notes,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/*  deleteOpportunityRow — senior cleanup                                     */
/* -------------------------------------------------------------------------- */

export async function deleteOpportunityRow(
  fd: FormData,
): Promise<OpportunityActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id" };

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_pipeline_opportunities")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/*  setRejectSweepVerdict — K5 PURSUE / HOLD / DROP on Reject Queue article  */
/* -------------------------------------------------------------------------- */

export async function setRejectSweepVerdict(
  fd: FormData,
): Promise<OpportunityActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const verdict = parseRejectVerdict(fd.get("verdict"));
  const notes = trimOrNull(fd.get("notes"), 1200);

  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!verdict) return { ok: false, error: "Pick a K5 verdict" };
  if ((verdict === "pursue_manual" || verdict === "drop") && !notes) {
    return {
      ok: false,
      error:
        "PURSUE-MANUAL and DROP need a note for the K5 audit trail.",
    };
  }

  const admin = createServiceClient();
  const uid = await currentUserId();

  // Iteration counter — next number for this article.
  const { count } = await admin
    .from("reject_queue_sweep")
    .select("id", { count: "exact", head: true })
    .eq("article_id", article_id);
  const iteration = (count ?? 0) + 1;

  const { data, error } = await admin
    .from("reject_queue_sweep")
    .insert({
      article_id,
      verdict,
      notes,
      swept_by: uid,
      iteration,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true, id: data?.id };
}
