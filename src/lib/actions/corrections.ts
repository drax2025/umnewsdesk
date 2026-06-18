"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  CORRECTION_KINDS,
  defaultPublicNotice,
  type CorrectionKind,
} from "@/lib/spec/stage13-corrections";
import { republishWithApprovedCorrections } from "@/lib/actions/publish";

/**
 * Stage 13 corrections — server actions.
 *
 *   fileCorrection(fd)        — editor files a draft. Auto-assigned next
 *                               sequence number for this article.
 *   updateCorrection(fd)      — editor edits a draft they own (or senior
 *                               edits any). Locked once approved.
 *   approveCorrection(fd)     — senior approves a draft. Stamps
 *                               approved_at/by, bumps articles
 *                               corrections_count and last_correction_at.
 *   withdrawCorrection(fd)    — senior pulls an approved or draft
 *                               correction (with reason). Append-only;
 *                               row stays for audit.
 *   deleteCorrection(fd)      — senior-only hard delete (typo cleanup).
 *                               Decrements corrections_count.
 */

export type CorrectionActionResult =
  | { ok: true; id?: string; sequence?: number }
  | { ok: false; error: string };

async function requireEditor(): Promise<CorrectionActionResult | null> {
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

async function requireSeniorEditor(): Promise<CorrectionActionResult | null> {
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

function trimOrNull(raw: FormDataEntryValue | null, max: number): string | null {
  if (raw === null) return null;
  const v = String(raw).trim().slice(0, max);
  return v.length === 0 ? null : v;
}

function parseKind(raw: FormDataEntryValue | null): CorrectionKind | null {
  const v = trimOrNull(raw, 20);
  if (!v) return null;
  return CORRECTION_KINDS.some((k) => k.value === v)
    ? (v as CorrectionKind)
    : null;
}

function parseFieldsChangedJson(
  raw: FormDataEntryValue | null,
): Record<string, { before?: string; after?: string }> | null {
  const v = trimOrNull(raw, 8000);
  if (!v) return {};
  try {
    const parsed = JSON.parse(v);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, { before?: string; after?: string }>;
  } catch {
    return null;
  }
}

function revalidateArticle(articleId: string) {
  revalidatePath(`/articles/${articleId}`);
  revalidatePath(`/articles/${articleId}/publish`);
  revalidatePath(`/corrections`);
}

/* -------------------------------------------------------------------------- */
/*  fileCorrection — editor draft                                             */
/* -------------------------------------------------------------------------- */

export async function fileCorrection(
  fd: FormData,
): Promise<CorrectionActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const articleId = trimOrNull(fd.get("article_id"), 40);
  const kind = parseKind(fd.get("kind"));
  const description = trimOrNull(fd.get("description"), 4000);
  const source = trimOrNull(fd.get("source"), 1200);
  const publicNoticeRaw = trimOrNull(fd.get("public_notice"), 2400);
  const fieldsChanged = parseFieldsChangedJson(fd.get("fields_changed"));

  if (!articleId) return { ok: false, error: "Missing article id" };
  if (!kind) return { ok: false, error: "Pick a correction kind." };
  if (!description) {
    return {
      ok: false,
      error: "Description required — what was wrong and how it was fixed.",
    };
  }
  if (fieldsChanged === null) {
    return { ok: false, error: "Fields-changed JSON is malformed." };
  }
  const publicNotice = publicNoticeRaw ?? defaultPublicNotice(kind);

  const admin = createServiceClient();
  const uid = await currentUserId();

  // Resolve title_id from the article.
  const { data: art } = await admin
    .from("articles")
    .select("id, title_id, state, published_at")
    .eq("id", articleId)
    .maybeSingle<{
      id: string;
      title_id: string;
      state: string;
      published_at: string | null;
    }>();
  if (!art) return { ok: false, error: "Article not found." };
  if (art.state !== "live" && !art.published_at) {
    return {
      ok: false,
      error: "Corrections only apply to live or previously-published articles.",
    };
  }

  // Determine next sequence.
  const { data: lastRow } = await admin
    .from("article_corrections")
    .select("sequence")
    .eq("article_id", articleId)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle<{ sequence: number }>();
  const sequence = (lastRow?.sequence ?? 0) + 1;

  const { data, error } = await admin
    .from("article_corrections")
    .insert({
      article_id: articleId,
      title_id: art.title_id,
      kind,
      status: "draft",
      description,
      source,
      public_notice: publicNotice,
      fields_changed: fieldsChanged,
      filed_by: uid,
      sequence,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { ok: false, error: error.message };

  revalidateArticle(articleId);
  return { ok: true, id: data.id, sequence };
}

/* -------------------------------------------------------------------------- */
/*  updateCorrection — editor / senior edits a draft                          */
/* -------------------------------------------------------------------------- */

export async function updateCorrection(
  fd: FormData,
): Promise<CorrectionActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = trimOrNull(fd.get("id"), 40);
  if (!id) return { ok: false, error: "Missing correction id" };

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("article_corrections")
    .select("id, article_id, status, filed_by")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      article_id: string;
      status: string;
      filed_by: string | null;
    }>();
  if (!existing) return { ok: false, error: "Correction not found." };
  if (existing.status !== "draft") {
    return {
      ok: false,
      error: "Only draft corrections can be edited (withdraw + re-file instead).",
    };
  }

  const uid = await currentUserId();
  const supabase = await createClient();
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", uid ?? "")
    .single<{ role: string | null }>();
  const isEditor = me?.role === "editor" || me?.role === "admin";
  if (!isEditor && existing.filed_by !== uid) {
    return {
      ok: false,
      error: "You can only edit corrections you filed (or ask an editor or admin).",
    };
  }

  const kind = parseKind(fd.get("kind"));
  const description = trimOrNull(fd.get("description"), 4000);
  const source = trimOrNull(fd.get("source"), 1200);
  const publicNoticeRaw = trimOrNull(fd.get("public_notice"), 2400);
  const fieldsChanged = parseFieldsChangedJson(fd.get("fields_changed"));

  if (!kind) return { ok: false, error: "Pick a correction kind." };
  if (!description) return { ok: false, error: "Description required." };
  if (fieldsChanged === null) {
    return { ok: false, error: "Fields-changed JSON is malformed." };
  }
  const publicNotice = publicNoticeRaw ?? defaultPublicNotice(kind);

  const { error } = await admin
    .from("article_corrections")
    .update({
      kind,
      description,
      source,
      public_notice: publicNotice,
      fields_changed: fieldsChanged,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateArticle(existing.article_id);
  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/*  approveCorrection — senior stamps live                                    */
/* -------------------------------------------------------------------------- */

export async function approveCorrection(
  fd: FormData,
): Promise<CorrectionActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = trimOrNull(fd.get("id"), 40);
  if (!id) return { ok: false, error: "Missing correction id" };

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("article_corrections")
    .select("id, article_id, status, kind")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      article_id: string;
      status: string;
      kind: string;
    }>();
  if (!existing) return { ok: false, error: "Correction not found." };
  if (existing.status !== "draft") {
    return {
      ok: false,
      error: `Cannot approve — already ${existing.status}.`,
    };
  }

  const uid = await currentUserId();
  const now = new Date().toISOString();

  const { error } = await admin
    .from("article_corrections")
    .update({
      status: "approved",
      approved_by: uid,
      approved_at: now,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Bump denormalised counters on the article.
  const { data: artRow } = await admin
    .from("articles")
    .select("id, corrections_count")
    .eq("id", existing.article_id)
    .maybeSingle<{ id: string; corrections_count: number | null }>();
  const newCount = (artRow?.corrections_count ?? 0) + 1;
  await admin
    .from("articles")
    .update({
      corrections_count: newCount,
      last_correction_at: now,
    })
    .eq("id", existing.article_id);

  // Retraction also flips the article state.
  if (existing.kind === "retraction") {
    await admin
      .from("articles")
      .update({ state: "killed" })
      .eq("id", existing.article_id);
  }

  // Push the running correction trail to WordPress (best-effort — failures
  // are logged via article_publish_log + failure log but do not unwind the
  // approval). Senior can re-trigger from the article dossier if needed.
  try {
    await republishWithApprovedCorrections(existing.article_id);
  } catch {
    /* republish failure already captured in publish log */
  }

  revalidateArticle(existing.article_id);
  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/*  withdrawCorrection — senior pulls a correction                            */
/* -------------------------------------------------------------------------- */

export async function withdrawCorrection(
  fd: FormData,
): Promise<CorrectionActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = trimOrNull(fd.get("id"), 40);
  const reason = trimOrNull(fd.get("reason"), 1200);
  if (!id) return { ok: false, error: "Missing correction id" };
  if (!reason) {
    return {
      ok: false,
      error: "Withdraw needs a reason (audit trail).",
    };
  }

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("article_corrections")
    .select("id, article_id, status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      article_id: string;
      status: string;
    }>();
  if (!existing) return { ok: false, error: "Correction not found." };
  if (existing.status === "withdrawn") {
    return { ok: false, error: "Already withdrawn." };
  }

  const uid = await currentUserId();
  const now = new Date().toISOString();

  const wasApproved = existing.status === "approved";

  const { error } = await admin
    .from("article_corrections")
    .update({
      status: "withdrawn",
      withdrawn_by: uid,
      withdrawn_at: now,
      withdrawn_reason: reason,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // If we're pulling a previously-approved correction, decrement counter
  // and push the revised correction trail to WordPress.
  if (wasApproved) {
    const { data: artRow } = await admin
      .from("articles")
      .select("id, corrections_count")
      .eq("id", existing.article_id)
      .maybeSingle<{ id: string; corrections_count: number | null }>();
    const newCount = Math.max(0, (artRow?.corrections_count ?? 1) - 1);
    await admin
      .from("articles")
      .update({ corrections_count: newCount })
      .eq("id", existing.article_id);

    try {
      await republishWithApprovedCorrections(existing.article_id);
    } catch {
      /* republish failure already captured in publish log */
    }
  }

  revalidateArticle(existing.article_id);
  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/*  deleteCorrection — hard delete (typo cleanup)                             */
/* -------------------------------------------------------------------------- */

export async function deleteCorrection(
  fd: FormData,
): Promise<CorrectionActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const id = trimOrNull(fd.get("id"), 40);
  if (!id) return { ok: false, error: "Missing correction id" };

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("article_corrections")
    .select("id, article_id, status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      article_id: string;
      status: string;
    }>();
  if (!existing) return { ok: false, error: "Correction not found." };

  const wasApproved = existing.status === "approved";

  // If approved, decrement counter on the way out.
  if (wasApproved) {
    const { data: artRow } = await admin
      .from("articles")
      .select("id, corrections_count")
      .eq("id", existing.article_id)
      .maybeSingle<{ id: string; corrections_count: number | null }>();
    const newCount = Math.max(0, (artRow?.corrections_count ?? 1) - 1);
    await admin
      .from("articles")
      .update({ corrections_count: newCount })
      .eq("id", existing.article_id);
  }

  const { error } = await admin
    .from("article_corrections")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Re-push the trail to WP if a live correction was removed.
  if (wasApproved) {
    try {
      await republishWithApprovedCorrections(existing.article_id);
    } catch {
      /* republish failure already captured in publish log */
    }
  }

  revalidateArticle(existing.article_id);
  return { ok: true };
}
