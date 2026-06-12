"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
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
import { logFailureEventInternal } from "@/lib/actions/failure-log";

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
}): Promise<WPPushResult> {
  const base = process.env.WORDPRESS_URL;
  const user = process.env.WORDPRESS_USER;
  const pass = process.env.WORDPRESS_APP_PASSWORD;

  if (!base || !user || !pass) {
    return {
      ok: false,
      error:
        "WordPress not configured (WORDPRESS_URL / WORDPRESS_USER / WORDPRESS_APP_PASSWORD).",
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
    .select("id, headline, standfirst, body, slug, state, backdate")
    .eq("id", article_id)
    .maybeSingle<{
      id: string;
      headline: string;
      standfirst: string | null;
      body: string | null;
      slug: string | null;
      state: string;
      backdate: string | null;
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
    const res = await pushToWordPress({
      title: article.headline,
      slug: slugOverride ?? article.slug,
      content: article.body ?? "",
      excerpt: article.standfirst,
      status: target === "draft_only" ? "draft" : "publish",
      post_date: article.backdate
        ? new Date(`${article.backdate}T07:00:00Z`).toISOString()
        : null,
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
  }

  revalidate(article_id);
  return {
    ok: true,
    publish_log_id: logRow.id,
    external_url: externalUrl,
  };
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
