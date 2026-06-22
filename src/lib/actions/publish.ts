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
  type ArtefactSweepStatus,
  type ArticleArtefactSweepRow,
  type PublishTarget,
} from "@/lib/spec/f8-publish";
import {
  applyApprovedCorrections,
  hasApprovedRetraction,
  type ArticleCorrectionRow,
} from "@/lib/spec/stage13-corrections";
import { logFailureEventInternal } from "@/lib/actions/failure-log";
import { recordPublishedToInventory } from "@/lib/actions/inventory";
import {
  markdownToHtml,
  markdownToInlineHtml,
} from "@/lib/publish/markdown-to-html";

/**
 * F8 Publish server actions.
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

export type PublishActionResult =
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

async function requireEditor(): Promise<PublishActionResult | null> {
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
  revalidatePath(`/articles/${articleId}/publish`);
  revalidatePath(`/articles/${articleId}/pre-flight`);
  revalidatePath(`/pipeline`);
  revalidatePath(`/board`);
}

/* -------------------------------------------------------------------------- */
/*  saveArtefactRow — set one artefact's status                               */
/* -------------------------------------------------------------------------- */

export async function saveArtefactRow(
  fd: FormData,
): Promise<PublishActionResult> {
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
      stage: "F7",
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
  | {
      ok: true;
      external_id: string | null;
      external_url: string | null;
      featured_image_warning?: string;
    }
  | { ok: false; error: string };

/**
 * Upload an image to the target WordPress media library and return the
 * attachment ID for use as `featured_media` on the post payload.
 *
 * Pipeline:
 *   1. Fetch the bytes from our Supabase Storage URL (or, in fallback mode,
 *      the candidate's source URL).
 *   2. POST to /wp-json/wp/v2/media with Content-Disposition: attachment so
 *      WP treats it as a file upload, not JSON.
 *   3. If alt text or caption were supplied, PATCH /media/{id} to set
 *      alt_text + caption. (WP rejects those on the initial upload — they
 *      have to land via the JSON metadata endpoint.)
 *
 * Returns null on any failure. Caller treats null as "publish the post
 * without a featured image and log a warning" rather than blocking the
 * publish — losing the hero image is recoverable from the WP admin; losing
 * the publish window often isn't.
 */
async function uploadFeaturedImageToWordPress(args: {
  base: string;
  user: string;
  pass: string;
  imageUrl: string;
  alt: string | null;
  credit: string | null;
}): Promise<{ id: number; warning: string | null } | { id: null; warning: string }> {
  // 1. Fetch our hosted image so we can stream the bytes into WP.
  let imgRes: Response;
  try {
    imgRes = await fetch(args.imageUrl);
  } catch (e) {
    return { id: null, warning: `Image fetch failed: ${(e as Error).message}` };
  }
  if (!imgRes.ok) {
    return {
      id: null,
      warning: `Image fetch returned HTTP ${imgRes.status} from ${args.imageUrl}`,
    };
  }
  const contentType =
    imgRes.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (buf.byteLength === 0) {
    return { id: null, warning: "Image fetch returned an empty body" };
  }

  // Pull a sane filename off the URL path; WP uses this as the attachment
  // slug + alt-text fallback. Strip the query string and any path noise.
  const urlPath = (() => {
    try {
      return new URL(args.imageUrl).pathname;
    } catch {
      return "/featured-image.jpg";
    }
  })();
  const filename = urlPath.split("/").pop() || "featured-image.jpg";

  // 2. Upload the binary.
  const mediaUrl = `${args.base.replace(/\/+$/, "")}/wp-json/wp/v2/media`;
  let upRes: Response;
  try {
    upRes = await fetch(mediaUrl, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${args.user}:${args.pass}`).toString("base64"),
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: buf,
    });
  } catch (e) {
    return { id: null, warning: `WP media upload failed: ${(e as Error).message}` };
  }
  if (!upRes.ok) {
    const text = await upRes.text().catch(() => "<no body>");
    return {
      id: null,
      warning: `WP media upload ${upRes.status}: ${text.slice(0, 400)}`,
    };
  }
  const upJson = (await upRes.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const attachmentId =
    typeof upJson?.id === "number" ? upJson.id : Number(upJson?.id ?? NaN);
  if (!Number.isFinite(attachmentId) || attachmentId <= 0) {
    return { id: null, warning: "WP media upload returned no attachment id" };
  }

  // 3. Patch alt + caption if we have them. Best-effort: a failure here
  // still leaves us with a usable attachment, just without metadata.
  if (args.alt || args.credit) {
    const patchUrl = `${mediaUrl}/${attachmentId}`;
    const patchBody: Record<string, unknown> = {};
    if (args.alt) patchBody.alt_text = args.alt;
    if (args.credit) patchBody.caption = args.credit;
    try {
      const patchRes = await fetch(patchUrl, {
        method: "POST", // WP REST accepts POST for updates too
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${args.user}:${args.pass}`).toString("base64"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patchBody),
      });
      if (!patchRes.ok) {
        const text = await patchRes.text().catch(() => "<no body>");
        return {
          id: attachmentId,
          warning: `Featured image uploaded (id ${attachmentId}) but alt/caption patch failed: WP ${patchRes.status}: ${text.slice(0, 200)}`,
        };
      }
    } catch (e) {
      return {
        id: attachmentId,
        warning: `Featured image uploaded but alt/caption patch threw: ${(e as Error).message}`,
      };
    }
  }

  return { id: attachmentId, warning: null };
}

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
  /**
   * Featured image — pre-resolved by the caller. May be either the editor's
   * Supabase Storage upload or the candidate's source URL fallback. NULL
   * means "publish without a featured image".
   */
  featured_image_url?: string | null;
  featured_image_alt?: string | null;
  featured_image_credit?: string | null;
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

  // Upload the featured image first (if any) so we have the attachment id
  // to thread into the post payload. Failures here degrade gracefully —
  // we still publish the post without `featured_media` and surface the
  // warning on the publish log so the editor can attach manually in WP.
  let featuredMediaId: number | null = null;
  let featuredWarning: string | null = null;
  if (payload.featured_image_url) {
    const upload = await uploadFeaturedImageToWordPress({
      base,
      user,
      pass,
      imageUrl: payload.featured_image_url,
      alt: payload.featured_image_alt ?? null,
      credit: payload.featured_image_credit ?? null,
    });
    featuredMediaId = upload.id;
    featuredWarning = upload.warning;
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
  if (featuredMediaId) body.featured_media = featuredMediaId;

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
    featured_image_warning: featuredWarning ?? undefined,
  };
}

/* -------------------------------------------------------------------------- */
/*  listWpCategories — live category list for the destination's WordPress      */
/* -------------------------------------------------------------------------- */

export type WpCategoriesResult =
  | { ok: true; categories: { id: number; name: string }[] }
  | { ok: false; error: string };

/**
 * Fetch the live category list from a title's WordPress install so the F8
 * editor can assign a category at push time. Reads per-title Section G creds
 * (falling back to WORDPRESS_* env vars) for the given title_id.
 */
export async function listWpCategories(
  fd: FormData,
): Promise<WpCategoriesResult> {
  const gate = await requireEditor();
  if (gate) return { ok: false, error: gate.ok ? "Forbidden" : gate.error };

  const titleId = String(fd.get("title_id") ?? "").trim();
  if (!titleId) return { ok: false, error: "Missing title_id" };

  const admin = createServiceClient();
  const { data: titleRow } = await admin
    .from("titles")
    .select("wp_base_url, wp_username, wp_app_password")
    .eq("id", titleId)
    .maybeSingle<{
      wp_base_url: string | null;
      wp_username: string | null;
      wp_app_password: string | null;
    }>();

  const base = titleRow?.wp_base_url ?? process.env.WORDPRESS_URL;
  const user = titleRow?.wp_username ?? process.env.WORDPRESS_USER;
  const pass = titleRow?.wp_app_password ?? process.env.WORDPRESS_APP_PASSWORD;
  if (!base || !user || !pass) {
    return {
      ok: false,
      error:
        "WordPress not configured for this destination — set credentials in /system/titles.",
    };
  }

  const url = `${base.replace(/\/+$/, "")}/wp-json/wp/v2/categories?per_page=100&orderby=name&order=asc&_fields=id,name`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
      },
    });
  } catch (e) {
    return { ok: false, error: `WP request failed: ${(e as Error).message}` };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>");
    return { ok: false, error: `WP ${res.status}: ${text.slice(0, 300)}` };
  }
  const json = (await res.json().catch(() => null)) as unknown;
  if (!Array.isArray(json)) {
    return { ok: false, error: "Unexpected WordPress categories response." };
  }
  const categories = json
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      const id = typeof o.id === "number" ? o.id : Number(o.id);
      const name = typeof o.name === "string" ? o.name : "";
      return Number.isFinite(id) && id > 0 && name ? { id, name } : null;
    })
    .filter((c): c is { id: number; name: string } => c !== null);
  return { ok: true, categories };
}

export async function publishArticle(
  fd: FormData,
): Promise<PublishActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const target = parseTarget(fd.get("target"));
  const manualUrl = trimOrNull(fd.get("manual_url"), 600);
  const slugOverride = trimOrNull(fd.get("slug"), 200);
  // Optional destination override (publish to a different title's WordPress)
  // and category override (overrides the title's wp_default_category_id for
  // this push). Both are no-ops when absent.
  const destTitleOverride = trimOrNull(fd.get("title_id"), 64);
  const categoryRaw = String(fd.get("category_id") ?? "").trim();
  const parsedCategory = categoryRaw ? Number(categoryRaw) : NaN;
  const categoryOverride =
    Number.isFinite(parsedCategory) && parsedCategory > 0
      ? parsedCategory
      : null;

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
      "id, headline, standfirst, body, slug, state, backdate, title_id, sectors, primary_frame, featured_image_url, featured_image_alt, featured_image_credit",
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
      featured_image_url: string | null;
      featured_image_alt: string | null;
      featured_image_credit: string | null;
    }>();
  if (!article) return { ok: false, error: "Article not found" };

  // Destination silo — defaults to the article's own title, but the F8 editor
  // can redirect the push to another title's WordPress install. On a successful
  // push we persist the chosen title back onto the article so the master
  // inventory and any later mark-live target the right place.
  const destinationTitleId = destTitleOverride ?? article.title_id;

  // Featured image resolution — editor's upload wins; otherwise sideload from
  // the candidate's source image_url as a best-effort fallback. The candidate
  // URL is often a PR-agency CDN, so sideload may fail (410, hotlink block),
  // but the upload pipeline handles that gracefully and degrades to "publish
  // without a hero" with a warning on the publish log.
  let resolvedFeaturedUrl: string | null = article.featured_image_url;
  let resolvedFeaturedAlt: string | null = article.featured_image_alt;
  const resolvedFeaturedCredit: string | null = article.featured_image_credit;
  let featuredSource: "editor_upload" | "candidate_fallback" | "none" = article.featured_image_url
    ? "editor_upload"
    : "none";
  if (!resolvedFeaturedUrl) {
    const { data: comm } = await admin
      .from("commissions")
      .select("candidate_id")
      .eq("article_id", article_id)
      .maybeSingle<{ candidate_id: string | null }>();
    if (comm?.candidate_id) {
      const { data: cand } = await admin
        .from("candidates")
        .select("image_url, working_headline")
        .eq("id", comm.candidate_id)
        .maybeSingle<{ image_url: string | null; working_headline: string | null }>();
      if (cand?.image_url) {
        resolvedFeaturedUrl = cand.image_url;
        // Alt-text fallback: the candidate headline is the best label we
        // have when no editor-supplied alt exists. Better than nothing
        // accessibility-wise; editor can fix later in WP.
        resolvedFeaturedAlt = resolvedFeaturedAlt ?? cand.working_headline ?? null;
        featuredSource = "candidate_fallback";
      }
    }
  }

  // Only 'scheduled' goes through the create-a-new-WP-post path. A 'wp_draft'
  // article already has a WP post, so it's promoted to live via markWpDraftLive
  // (below) instead — pushing again here would create a duplicate WP post.
  if (article.state !== "scheduled") {
    return {
      ok: false,
      error: `Article must be in 'scheduled' state to publish (currently '${article.state}'). An Editor [PUB] PASS on the F7 Pre-Flight pack moves it to scheduled.`,
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
    featured_image_url: resolvedFeaturedUrl,
    featured_image_source: featuredSource,
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
  let featuredImageWarning: string | null = null;

  if (target === "manual") {
    externalUrl = manualUrl;
  } else if (target === "wordpress" || target === "draft_only") {
    // Section G — per-title WP credentials override the env-var defaults.
    const { data: titleRow } = await admin
      .from("titles")
      .select(
        "wp_base_url, wp_username, wp_app_password, wp_default_status, wp_default_category_id",
      )
      .eq("id", destinationTitleId)
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

    // The article body + standfirst are stored as markdown (DraftEditor
    // saves md; email ingest converts inbound HTML to md). WordPress'
    // `content` field expects HTML — so we render here, just before the
    // network call, rather than mutating what's saved on the row. That
    // keeps re-render idempotent and avoids any drift between what the
    // editor sees in the dossier and what we ship.
    const renderedContent = markdownToHtml(article.body);
    const renderedExcerpt = article.standfirst
      ? markdownToInlineHtml(article.standfirst)
      : null;

    const res = await pushToWordPress({
      title: article.headline,
      slug: slugOverride ?? article.slug,
      content: renderedContent,
      excerpt: renderedExcerpt,
      status: effectiveStatus,
      post_date: article.backdate
        ? new Date(`${article.backdate}T07:00:00Z`).toISOString()
        : null,
      title_wp_base_url: titleRow?.wp_base_url ?? null,
      title_wp_username: titleRow?.wp_username ?? null,
      title_wp_app_password: titleRow?.wp_app_password ?? null,
      title_wp_default_category_id:
        categoryOverride ?? titleRow?.wp_default_category_id ?? null,
      featured_image_url: resolvedFeaturedUrl,
      featured_image_alt: resolvedFeaturedAlt,
      featured_image_credit: resolvedFeaturedCredit,
    });
    if (res.ok) {
      externalId = res.external_id;
      externalUrl = res.external_url;
      featuredImageWarning = res.featured_image_warning ?? null;
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
      stage: "F7",
      event: "other",
      gate_code: null,
      detail: `F8 publish push failed: ${pushError}`,
      created_by: uid,
    });

    revalidate(article_id);
    return { ok: false, error: pushError };
  }

  // Success path. The featured-image warning (if any) is non-fatal — the
  // post itself published cleanly — but we still capture it on the log row's
  // `error` field so the editor sees it on the F8 history table and can
  // reattach the hero image manually in WP if needed. Distinguish this from
  // a real publish failure with the "FEATURED_IMAGE:" prefix.
  await admin
    .from("article_publish_log")
    .update({
      status: target === "draft_only" ? "queued" : "published",
      external_id: externalId,
      external_url: externalUrl,
      error: featuredImageWarning
        ? `FEATURED_IMAGE: ${featuredImageWarning}`
        : null,
      completed_at: now,
    })
    .eq("id", logRow.id);

  // Stamp the final sweep as completed on any successful push (draft or live).
  await admin
    .from("article_artefact_sweep")
    .update({
      completed_at: now,
      completed_by: uid,
    })
    .eq("article_id", article_id);

  if (target === "draft_only") {
    // Released to WordPress as a draft — handed off but NOT publicly live.
    // Move to the 'wp_draft' state; deliberately do NOT set published_at or
    // write the master inventory (those mean "publicly published"). A later
    // "Publish to WordPress" push promotes wp_draft → live.
    await admin
      .from("articles")
      .update({
        state: "wp_draft",
        ...(destinationTitleId !== article.title_id
          ? { title_id: destinationTitleId }
          : {}),
      })
      .eq("id", article_id);
  } else {
    await admin
      .from("articles")
      .update({
        state: "live",
        published_at: now,
        ...(destinationTitleId !== article.title_id
          ? { title_id: destinationTitleId }
          : {}),
      })
      .eq("id", article_id);

    // A2 master content inventory write-back (E7 mitigation, F8 step 5).
    // Best-effort — failure here must not unwind the publish; the editor
    // can fix the inventory from /inventory if it slips.
    if (externalUrl) {
      try {
        await recordPublishedToInventory({
          title_id: destinationTitleId,
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
/*  markWpDraftLive — reflect a WP-draft going public                          */
/* -------------------------------------------------------------------------- */

/**
 * Promote a 'wp_draft' article to 'live' once it has actually been published on
 * the WordPress site (typically published from the WP dashboard).
 *
 * This is a record sync, not a new push: the WP post already exists (it was
 * created by the earlier draft push), so we do NOT call WordPress again — that
 * would create a duplicate post. We flip the newsroom state to live, stamp
 * published_at, mark the draft publish-log row as published, and write the A2
 * master content inventory (using the URL the draft push recorded).
 *
 * Editor + admin only.
 */
export async function markWpDraftLive(
  fd: FormData,
): Promise<PublishActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!article_id) return { ok: false, error: "Missing article_id" };

  const admin = createServiceClient();
  const { data: article } = await admin
    .from("articles")
    .select("id, state, title_id, headline, primary_frame, sectors, backdate")
    .eq("id", article_id)
    .maybeSingle<{
      id: string;
      state: string;
      title_id: string;
      headline: string;
      primary_frame: string | null;
      sectors: string[] | null;
      backdate: string | null;
    }>();
  if (!article) return { ok: false, error: "Article not found" };
  if (article.state !== "wp_draft") {
    return {
      ok: false,
      error: `Only WP-draft articles can be marked live (currently '${article.state}').`,
    };
  }

  // The most recent publish-log row is the draft push — it carries the WP URL.
  const { data: lastLog } = await admin
    .from("article_publish_log")
    .select("id, external_url")
    .eq("article_id", article_id)
    .order("attempted_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; external_url: string | null }>();

  const now = new Date().toISOString();
  const uid = await currentUserId();

  const { error: artErr } = await admin
    .from("articles")
    .update({ state: "live", published_at: now })
    .eq("id", article_id);
  if (artErr) return { ok: false, error: artErr.message };

  // Flip the draft log row to 'published' so the F8 Live panel renders.
  if (lastLog) {
    await admin
      .from("article_publish_log")
      .update({ status: "published", completed_at: now })
      .eq("id", lastLog.id);
  }

  // A2 master content inventory write-back — best-effort.
  if (lastLog?.external_url) {
    try {
      await recordPublishedToInventory({
        title_id: article.title_id,
        article_id,
        headline: article.headline,
        url: lastLog.external_url,
        silo: article.primary_frame ?? null,
        sectors: article.sectors ?? [],
        published_at: article.backdate ?? now,
        created_by: uid,
      });
    } catch {
      /* inventory drift will be visible at /inventory */
    }
  }

  revalidate(article_id);
  return { ok: true, publish_log_id: lastLog?.id ?? "", external_url: lastLog?.external_url ?? null };
}

/* -------------------------------------------------------------------------- */
/*  republishWithApprovedCorrections — Stage 13 hook                          */
/*                                                                            */
/*  When a Admin approves, withdraws, or deletes a correction, we     */
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
  // applyApprovedCorrections appends markdown blocks (the "[CORRECTION]:"
  // notice strings live in stage13-corrections as markdown). Convert the
  // whole composed body once here so the PATCH to WP carries HTML, same
  // as the initial publish path.
  const composedBody = markdownToHtml(
    applyApprovedCorrections(article.body ?? "", corrections),
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
      stage: "F7",
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
): Promise<PublishActionResult> {
  const gate = await requireEditor();
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
    stage: "F7",
    event: "other",
    gate_code: null,
    detail: `F8 retract: ${reason}`,
    created_by: uid,
  });

  revalidate(article_id);
  return { ok: true };
}

// NOTE: do NOT add `export type { ... }` re-exports to this file. "use server"
// modules require every export to be an async function — Next.js wraps each
// export as a server-action thunk, and a type re-export ends up emitted as a
// ReferenceError at SSR module-evaluation time (digest 2438283078 case).
// Consumers should import types directly from `@/lib/spec/f8-publish`.
