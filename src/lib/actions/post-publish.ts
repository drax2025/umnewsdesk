"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ARTEFACTS,
  ARTEFACT_CODE_SET,
  normaliseSweepResults,
  summariseSweep,
  type ArtefactCode,
  type ArtefactSweepEntry,
  type ArtefactSweepResults,
  type ArtefactSweepStatus,
  type ArticleArtefactSweepRow,
  type PublishTarget,
} from "@/lib/spec/f8-post-publish";
import {
  applyApprovedCorrections,
  hasApprovedRetraction,
  type ArticleCorrectionRow,
} from "@/lib/spec/stage13-corrections";
import { logFailureEventInternal } from "@/lib/actions/failure-log";
import { recordPublishedToInventory } from "@/lib/actions/inventory";

/**
 * F8 Post-Publish server actions.
 *
 * Four write paths:
 *
 *   - saveArtefactRow(fd)       — set one artefact's status + note (and bump
 *                                 the wrapping row, creating it on first save)
 *   - publishArticle(fd)        — final-state push: WordPress / manual / draft.
 *                                 Sets article state to 'live' on success,
 *                                 records article_publish_log row, writes
 *                                 published_at, and auto-routes pack §0 events.
 *   - retractArticle(fd)        — undo: flip the latest published log to
 *                                 'retracted' and bump article state back to
 *                                 'scheduled' (senior approval still holds).
 *   - logManualPublish(fd)      — convenience wrapper for editors who pushed
 *                                 outside the system; records URL only.
 *
 * Auto-routing: contamination, publish failure, and retract all append to the
 * cross-agent failure log (pack §0) without the editor needing to.
 */

export type PostPublishActionResult =
  | { ok: true }
  | { ok: true; publish_log_id: string; external_url: string | null }
  | { ok: false; error: string };

const SWEEP_STATUS_SET = new Set<ArtefactSweepStatus>([
  "pending",
  "swept_clean",
  "contamination_found",
  "na",
]);

const TARGET_SET = new Set<PublishTarget>(["wordpress", "manual", "draft_only"]);

/* -------------------------------------------------------------------------- */
/*  Auth + helpers                                                            */
/* -------------------------------------------------------------------------- */

async function requireEditor(): Promise<PostPublishActionResult | null> {
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
  if (me?.role !== "editor" && me?.role !== "senior_editor") {
    return { ok: false, error: "Editors only" };
  }
  return null;
}

async function requireSeniorEditor(): Promise<PostPublishActionResult | null> {
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
  if (me?.role !== "senior_editor") {
    return { ok: false, error: "Senior Editor only" };
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

function parseArtefactCode(raw: unknown): ArtefactCode | null {
  const s = String(raw ?? "").trim();
  return ARTEFACT_CODE_SET.has(s as ArtefactCode) ? (s as ArtefactCode) : null;
}

function parseSweepStatus(raw: unknown): ArtefactSweepStatus | null {
  const s = String(raw ?? "").trim();
  return SWEEP_STATUS_SET.has(s as ArtefactSweepStatus)
    ? (s as ArtefactSweepStatus)
    : null;
}

function parseTarget(raw: unknown): PublishTarget | null {
  const s = String(raw ?? "").trim();
  return TARGET_SET.has(s as PublishTarget) ? (s as PublishTarget) : null;
}

function revalidate(articleId: string) {
  revalidatePath(`/articles/${articleId}`);
  revalidatePath(`/articles/${articleId}/post-publish`);
  revalidatePath(`/articles/${articleId}/pre-publish`);
  revalidatePath(`/pipeline`);
  revalidatePath(`/board`);
}

/* -------------------------------------------------------------------------- */
/*  saveArtefactRow — set one artefact's status                               */
/* -------------------------------------------------------------------------- */

export async function saveArtefactRow(
  fd: FormData,
): Promise<PostPublishActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const code = parseArtefactCode(fd.get("code"));
  const status = parseSweepStatus(fd.get("status"));
  const note = trimOrNull(fd.get("note"), 2400);

  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!code) return { ok: false, error: "Unknown artefact code" };
  if (!status) return { ok: false, error: "Pick a status" };

  if (status === "contamination_found" && !note) {
    return {
      ok: false,
      error: "Contamination found — describe what was found (required).",
    };
  }
  if (status === "na" && !note) {
    return {
      ok: false,
      error: "N/A — record why this artefact does not apply (required).",
    };
  }

  const admin = createServiceClient();
  const uid = await currentUserId();

  // Read existing row (if any) so we can merge JSONB.
  const { data: existing } = await admin
    .from("article_artefact_sweep")
    .select("results")
    .eq("article_id", article_id)
    .maybeSingle<{ results: unknown }>();

  const merged = normaliseSweepResults(existing?.results ?? null);
  merged[code] = { status, note } as ArtefactSweepEntry;

  const { error: upErr } = await admin
    .from("article_artefact_sweep")
    .upsert(
      {
        article_id,
        results: merged,
        completed_by: uid,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "article_id" },
    );
  if (upErr) return { ok: false, error: upErr.message };

  // Auto-route contamination to pack §0.
  if (status === "contamination_found") {
    await logFailureEventInternal({
      article_id,
      stage: "F9",
      event: "standing_rule_check_late",
      gate_code: "B2",
      detail: `F8 final sweep found contamination on artefact ${code}: ${note}`,
      created_by: uid,
    });
  }

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  bulkStampArtefactSweep — fast-path for low-exposure articles              */
/*                                                                            */
/*  Stamps every currently-pending artefact with a single status (either      */
/*  swept_clean or na). Designed for Tier 1 press releases that have zero     */
/*  exposure to DIGIT / Futurescot / SFN — the editor would otherwise have    */
/*  to click through all 17 codes one by one.                                 */
/*                                                                            */
/*  Conservative semantics: only fills rows whose current status is           */
/*  'pending'. Rows already stamped Clean, Found, or N/A are left alone so    */
/*  prior per-row work and per-row notes are never clobbered. After bulk      */
/*  stamping the editor can still flip individual rows to                     */
/*  contamination_found if exposure is discovered.                            */
/*                                                                            */
/*  Bulk N/A requires a reason; the reason is applied as the note for every   */
/*  pending artefact, so the audit trail still names a justification.         */
/* -------------------------------------------------------------------------- */

export type BulkStampResult =
  | { ok: true; stamped: number }
  | { ok: false; error: string };

export async function bulkStampArtefactSweep(
  fd: FormData,
): Promise<BulkStampResult> {
  const gate = await requireEditor();
  if (gate && !gate.ok) return { ok: false, error: gate.error };

  const article_id = String(fd.get("article_id") ?? "").trim();
  const status = parseSweepStatus(fd.get("status"));
  const reason = trimOrNull(fd.get("reason"), 2400);

  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (status !== "swept_clean" && status !== "na") {
    return {
      ok: false,
      error: "Bulk stamp only supports 'swept_clean' or 'na'.",
    };
  }
  if (status === "na" && !reason) {
    return {
      ok: false,
      error:
        "Bulk N/A requires a reason that applies to every pending artefact.",
    };
  }

  const admin = createServiceClient();
  const uid = await currentUserId();

  const { data: existing } = await admin
    .from("article_artefact_sweep")
    .select("results")
    .eq("article_id", article_id)
    .maybeSingle<{ results: unknown }>();

  const merged = normaliseSweepResults(existing?.results ?? null);
  const note = status === "na" ? reason : null;

  let stamped = 0;
  for (const def of ARTEFACTS) {
    const current = merged[def.code];
    if (!current || current.status === "pending") {
      merged[def.code] = { status, note } as ArtefactSweepEntry;
      stamped += 1;
    }
  }

  if (stamped === 0) {
    // Nothing pending — no-op, but don't error.
    return { ok: true, stamped: 0 };
  }

  const { error: upErr } = await admin
    .from("article_artefact_sweep")
    .upsert(
      {
        article_id,
        results: merged,
        completed_by: uid,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "article_id" },
    );
  if (upErr) return { ok: false, error: upErr.message };

  revalidate(article_id);
  return { ok: true, stamped };
}

/* -------------------------------------------------------------------------- */
/*  publishArticle — F8 main verb                                             */
/* -------------------------------------------------------------------------- */

type WPPushResult =
  | { ok: true; external_id: string | null; external_url: string | null }
  | { ok: false; error: string };

async function pushToWordPress(payload: {
  title: string;
  slug: string | null;
  content: string;
  excerpt: string | null;
  status: "publish" | "future" | "draft";
  post_date: string | null;
  /**
   * Section G — per-title overrides. When `title_*` values are present they
   * supersede the WORDPRESS_* env vars, so each publication silo publishes
   * to its own WordPress install. Env vars stay as a fallback for the
   * default title during phase-1 rollout.
   */
  title_wp_base_url?: string | null;
  title_wp_username?: string | null;
  title_wp_app_password?: string | null;
  title_wp_default_category_id?: number | null;
}): Promise<WPPushResult> {
  const base = payload.title_wp_base_url ?? process.env.WORDPRESS_URL;
  const user = payload.title_wp_username ?? process.env.WORDPRESS_USER;
  const pass =
    payload.title_wp_app_password ?? process.env.WORDPRESS_APP_PASSWORD;

  if (!base || !user || !pass) {
    return {
      ok: false,
      error:
        "WordPress not configured for this title (set wp_base_url / wp_username / wp_app_password in /system/titles, or WORDPRESS_* env vars as fallback).",
    };
  }

  const url = `${base.replace(/\/+$/, "")}/wp-json/wp/v2/posts`;
  const body: Record<string, unknown> = {
    title: payload.title,
    content: payload.content,
    status: payload.status,
  };
  if (payload.slug) body.slug = payload.slug;
  if (payload.excerpt) body.excerpt = payload.excerpt;
  if (payload.post_date) body.date = payload.post_date;
  if (payload.title_wp_default_category_id) {
    body.categories = [payload.title_wp_default_category_id];
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: `WP request failed: ${(e as Error).message}` };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>");
    return {
      ok: false,
      error: `WP ${res.status}: ${text.slice(0, 600)}`,
    };
  }

  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return {
    ok: true,
    external_id: json?.id ? String(json.id) : null,
    external_url:
      typeof json?.link === "string"
        ? json.link
        : null,
  };
}

export async function publishArticle(
  fd: FormData,
): Promise<PostPublishActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const target = parseTarget(fd.get("target"));
  const manualUrl = trimOrNull(fd.get("manual_url"), 600);
  const slugOverride = trimOrNull(fd.get("slug"), 200);

  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!target) return { ok: false, error: "Pick a publish target" };
  if (target === "manual" && !manualUrl) {
    return { ok: false, error: "Manual publish needs the live URL." };
  }

  const admin = createServiceClient();
  const uid = await currentUserId();

  // Load the article + sweep state.
  const { data: article } = await admin
    .from("articles")
    .select(
      "id, headline, standfirst, body, slug, state, backdate, title_id, sectors, primary_frame",
    )
    .eq("id", article_id)
    .maybeSingle<{
      id: string;
      headline: string;
      standfirst: string | null;
      body: string | null;
      slug: string | null;
      state: string;
      backdate: string | null;
      title_id: string;
      sectors: string[] | null;
      primary_frame: string | null;
    }>();
  if (!article) return { ok: false, error: "Article not found" };

  if (article.state !== "scheduled" && article.state !== "legal") {
    return {
      ok: false,
      error: `Article must be in 'scheduled' state to publish (currently '${article.state}').`,
    };
  }

  // Enforce the final sweep gate.
  const { data: sweepRow } = await admin
    .from("article_artefact_sweep")
    .select("article_id, results, completed_at, completed_by, updated_at")
    .eq("article_id", article_id)
    .maybeSingle<ArticleArtefactSweepRow>();
  const summary = summariseSweep(sweepRow ?? null);
  if (!summary.cleanForPush) {
    return {
      ok: false,
      error: `Final B2 sweep is not clean (${summary.pending} pending · ${summary.found} contamination · ${summary.missingNAJustification.length} N/A unjustified). Resolve before push.`,
    };
  }

  const now = new Date().toISOString();
  const payload = {
    headline: article.headline,
    standfirst: article.standfirst,
    body_chars: article.body?.length ?? 0,
    backdate: article.backdate,
    target,
    slug: slugOverride ?? article.slug,
  };

  // Queue log row first so failures are still traceable.
  const { data: logRow, error: logErr } = await admin
    .from("article_publish_log")
    .insert({
      article_id,
      target,
      status: "publishing",
      payload,
      created_by: uid,
    })
    .select("id")
    .single<{ id: string }>();
  if (logErr) return { ok: false, error: logErr.message };

  let externalId: string | null = null;
  let externalUrl: string | null = null;
  let pushError: string | null = null;

  if (target === "manual") {
    externalUrl = manualUrl;
  } else if (target === "wordpress" || target === "draft_only") {
    // Section G — per-title WP credentials override the env-var defaults.
    const { data: titleRow } = await admin
      .from("titles")
      .select(
        "wp_base_url, wp_username, wp_app_password, wp_default_status, wp_default_category_id",
      )
      .eq("id", article.title_id)
      .maybeSingle<{
        wp_base_url: string | null;
        wp_username: string | null;
        wp_app_password: string | null;
        wp_default_status: string | null;
        wp_default_category_id: number | null;
      }>();

    // Per-title default status only applies for live publish, not the
    // explicit draft_only verb.
    const effectiveStatus: "publish" | "draft" | "future" =
      target === "draft_only"
        ? "draft"
        : titleRow?.wp_default_status === "draft" ||
            titleRow?.wp_default_status === "future"
          ? (titleRow.wp_default_status as "draft" | "future")
          : "publish";

    const res = await pushToWordPress({
      title: article.headline,
      slug: slugOverride ?? article.slug,
      content: article.body ?? "",
      excerpt: article.standfirst,
      status: effectiveStatus,
      post_date: article.backdate
        ? new Date(`${article.backdate}T07:00:00Z`).toISOString()
        : null,
      title_wp_base_url: titleRow?.wp_base_url ?? null,
      title_wp_username: titleRow?.wp_username ?? null,
      title_wp_app_password: titleRow?.wp_app_password ?? null,
      title_wp_default_category_id: titleRow?.wp_default_category_id ?? null,
    });
    if (res.ok) {
      externalId = res.external_id;
      externalUrl = res.external_url;
    } else {
      pushError = res.error;
    }
  }

  if (pushError) {
    await admin
      .from("article_publish_log")
      .update({
        status: "failed",
        error: pushError,
        completed_at: now,
      })
      .eq("id", logRow.id);

    await logFailureEventInternal({
      article_id,
      stage: "F9",
      event: "other",
      gate_code: null,
      detail: `F8 publish push failed: ${pushError}`,
      created_by: uid,
    });

    revalidate(article_id);
    return { ok: false, error: pushError };
  }

  // Success path.
  await admin
    .from("article_publish_log")
    .update({
      status: target === "draft_only" ? "queued" : "published",
      external_id: externalId,
      external_url: externalUrl,
      completed_at: now,
    })
    .eq("id", logRow.id);

  if (target !== "draft_only") {
    await admin
      .from("articles")
      .update({
        state: "live",
        published_at: now,
      })
      .eq("id", article_id);

    // Stamp the sweep as completed.
    await admin
      .from("article_artefact_sweep")
      .update({
        completed_at: now,
        completed_by: uid,
      })
      .eq("article_id", article_id);

    // A2 master content inventory write-back (E7 mitigation, F8 step 5).
    // Best-effort — failure here must not unwind the publish; the editor
    // can fix the inventory from /inventory if it slips.
    if (externalUrl) {
      try {
        await recordPublishedToInventory({
          title_id: article.title_id,
          article_id,
          headline: article.headline,
          url: externalUrl,
          silo: article.primary_frame ?? null,
          sectors: article.sectors ?? [],
          published_at: article.backdate ?? now,
          created_by: uid,
        });
      } catch {
        /* inventory drift will be visible at /inventory */
      }
    }
  }

  revalidate(article_id);
  return {
    ok: true,
    publish_log_id: logRow.id,
    external_url: externalUrl,
  };
}

/* -------------------------------------------------------------------------- */
/*  republishWithApprovedCorrections — Stage 13 hook                          */
/*                                                                            */
/*  When a Senior Editor approves, withdraws, or deletes a correction, we     */
/*  push an updated post body back to WordPress that includes every currently */
/*  approved correction. A retraction flips the WP post to `draft` so it is   */
/*  no longer publicly readable while still preserved in the WP archive.      */
/*                                                                            */
/*  Best-effort: failures don't unwind the corrections action; they're        */
/*  surfaced through the article_publish_log row.                             */
/* -------------------------------------------------------------------------- */

export type RepublishResult =
  | { ok: true; updated: boolean; reason?: string }
  | { ok: false; error: string };

export async function republishWithApprovedCorrections(
  articleId: string,
): Promise<RepublishResult> {
  const admin = createServiceClient();

  // Find the most recent successful WordPress publish for this article.
  // Manual targets have no external_id to update; draft_only is non-public.
  const { data: lastWpLog } = await admin
    .from("article_publish_log")
    .select("id, external_id, external_url, target, status")
    .eq("article_id", articleId)
    .eq("target", "wordpress")
    .eq("status", "published")
    .not("external_id", "is", null)
    .order("attempted_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      external_id: string | null;
      external_url: string | null;
      target: string;
      status: string;
    }>();

  if (!lastWpLog || !lastWpLog.external_id) {
    return {
      ok: true,
      updated: false,
      reason:
        "Article has no WordPress publish to update (manual / draft / unpublished).",
    };
  }

  // Load article + title creds + approved corrections in parallel.
  const [
    { data: article },
    { data: correctionsRaw },
  ] = await Promise.all([
    admin
      .from("articles")
      .select("id, headline, body, title_id")
      .eq("id", articleId)
      .maybeSingle<{
        id: string;
        headline: string;
        body: string | null;
        title_id: string;
      }>(),
    admin
      .from("article_corrections")
      .select(
        "id, article_id, title_id, kind, status, description, source, public_notice, fields_changed, filed_by, filed_at, approved_by, approved_at, withdrawn_by, withdrawn_at, withdrawn_reason, sequence, updated_at",
      )
      .eq("article_id", articleId)
      .eq("status", "approved")
      .order("sequence", { ascending: true })
      .returns<ArticleCorrectionRow[]>(),
  ]);

  if (!article) return { ok: false, error: "Article not found." };

  const { data: titleRow } = await admin
    .from("titles")
    .select(
      "wp_base_url, wp_username, wp_app_password, wp_default_category_id",
    )
    .eq("id", article.title_id)
    .maybeSingle<{
      wp_base_url: string | null;
      wp_username: string | null;
      wp_app_password: string | null;
      wp_default_category_id: number | null;
    }>();

  const corrections = correctionsRaw ?? [];
  const composedBody = applyApprovedCorrections(
    article.body ?? "",
    corrections,
  );
  // Retraction takes the WP post out of public circulation (kept in archive).
  const wpStatus: "publish" | "draft" = hasApprovedRetraction(corrections)
    ? "draft"
    : "publish";

  const base = titleRow?.wp_base_url ?? process.env.WORDPRESS_URL;
  const user = titleRow?.wp_username ?? process.env.WORDPRESS_USER;
  const pass = titleRow?.wp_app_password ?? process.env.WORDPRESS_APP_PASSWORD;

  if (!base || !user || !pass) {
    return {
      ok: false,
      error:
        "WordPress credentials missing for this title — cannot republish correction.",
    };
  }

  const url = `${base.replace(/\/+$/, "")}/wp-json/wp/v2/posts/${encodeURIComponent(lastWpLog.external_id)}`;
  let pushError: string | null = null;
  let externalUrl: string | null = lastWpLog.external_url;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
      },
      body: JSON.stringify({
        content: composedBody,
        status: wpStatus,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "<no body>");
      pushError = `WP ${res.status}: ${text.slice(0, 600)}`;
    } else {
      const json = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (typeof json?.link === "string") externalUrl = json.link;
    }
  } catch (e) {
    pushError = `WP request failed: ${(e as Error).message}`;
  }

  // Log the republish attempt either way so the audit trail is intact.
  await admin.from("article_publish_log").insert({
    article_id: articleId,
    target: "wordpress",
    status: pushError ? "failed" : "published",
    external_id: lastWpLog.external_id,
    external_url: externalUrl,
    error: pushError,
    payload: {
      kind: "correction_republish",
      wp_status: wpStatus,
      approved_count: corrections.length,
      retraction: wpStatus === "draft",
    },
    completed_at: new Date().toISOString(),
  });

  if (pushError) {
    await logFailureEventInternal({
      article_id: articleId,
      stage: "F9",
      event: "other",
      gate_code: null,
      detail: `Stage 13 republish failed: ${pushError}`,
      created_by: null,
    });
    return { ok: false, error: pushError };
  }

  revalidate(articleId);
  return { ok: true, updated: true };
}

/* -------------------------------------------------------------------------- */
/*  retractArticle — undo a successful publish                                */
/* -------------------------------------------------------------------------- */

export async function retractArticle(
  fd: FormData,
): Promise<PostPublishActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const log_id = String(fd.get("publish_log_id") ?? "").trim();
  const reason = trimOrNull(fd.get("reason"), 2400);

  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!log_id) return { ok: false, error: "Missing publish_log_id" };
  if (!reason) {
    return { ok: false, error: "Retract reason is required for pack §0." };
  }

  const admin = createServiceClient();
  const uid = await currentUserId();
  const now = new Date().toISOString();

  const { error: upErr } = await admin
    .from("article_publish_log")
    .update({ status: "retracted", error: reason, completed_at: now })
    .eq("id", log_id)
    .eq("article_id", article_id);
  if (upErr) return { ok: false, error: upErr.message };

  await admin
    .from("articles")
    .update({ state: "scheduled" })
    .eq("id", article_id);

  await logFailureEventInternal({
    article_id,
    stage: "F9",
    event: "other",
    gate_code: null,
    detail: `F8 retract: ${reason}`,
    created_by: uid,
  });

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Read helpers (used by the page)                                           */
/* -------------------------------------------------------------------------- */

export type { ArtefactSweepResults };
