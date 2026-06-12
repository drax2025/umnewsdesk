"use server";

import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  renderPackMarkdown,
  type ArticleBundle,
  type PackBundle,
} from "@/lib/render/pack-renderer";
import type { FramingBrief } from "@/lib/spec/f1-triage";

/**
 * F9 Pack rendering — produces the 12-section markdown, stores it in
 * pre_publish_packs.archive_markdown + signature, and (in dev) also writes
 * to workspace/pre_publish_packs/<REF>.md so the on-disk archive matches.
 *
 *   renderPack(fd) — load bundle for pack_ref, render, persist, return text
 *
 * Editor + senior_editor gated. Successful render bumps rendered_at /
 * rendered_by on the pack row.
 */

export type RenderPackResult =
  | { ok: true; pack_ref: string; signature: string; bytes: number }
  | { ok: false; error: string };

async function requireEditor(): Promise<RenderPackResult | null> {
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

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Bundle loader                                                             */
/* -------------------------------------------------------------------------- */

async function loadArticleBundle(
  admin: ReturnType<typeof createServiceClient>,
  articleId: string,
): Promise<ArticleBundle | null> {
  const { data: article } = await admin
    .from("articles")
    .select(
      "id, headline, standfirst, body, slug, state, primary_frame, geo_tier, sectors, published_at, backdate, backdate_kind, backdate_rationale, backdate_set_at",
    )
    .eq("id", articleId)
    .maybeSingle<ArticleBundle["article"]>();
  if (!article) return null;

  // Resolve defamation tier + framing brief via commission/candidate join.
  const { data: commission } = await admin
    .from("commissions")
    .select("candidate_id")
    .eq("article_id", articleId)
    .maybeSingle<{ candidate_id: string | null }>();

  let defTier: 1 | 2 | 3 | null = null;
  let brief: FramingBrief | null = null;
  if (commission?.candidate_id) {
    const { data: cand } = await admin
      .from("candidates")
      .select("framing_brief, defamation_tier")
      .eq("id", commission.candidate_id)
      .maybeSingle<{
        framing_brief: FramingBrief | null;
        defamation_tier: number | null;
      }>();
    brief = cand?.framing_brief ?? null;
    const t = cand?.defamation_tier;
    if (t === 1 || t === 2 || t === 3) defTier = t;
  }

  const [
    { data: sources },
    { data: quotes },
    { data: research },
    { data: headlinesRows },
    { data: interlinks },
    { data: review },
    { data: preP },
    { data: internalFailures },
    { data: standingRule },
    { data: reasonableSteps },
    { data: failureLog },
    { data: artefactSweep },
    { data: publishLog },
  ] = await Promise.all([
    admin
      .from("article_sources")
      .select(
        "id, article_id, kind, url, title, publisher, published_at, author, content, is_signal_only, is_paywalled, notes, order_idx, fetched_at",
      )
      .eq("article_id", articleId)
      .order("kind")
      .order("order_idx"),
    admin
      .from("article_quotes")
      .select(
        "id, article_id, source_id, quote_text, speaker, role, institution, order_idx, created_at",
      )
      .eq("article_id", articleId)
      .order("order_idx"),
    admin
      .from("article_research")
      .select(
        "article_id, framing_feasibility, feasibility_evidence, dependency_status, primary_paywalled, nfp_footer_draft, nfp_footer_fields, verdict, verdict_at, verdict_rationale, updated_at",
      )
      .eq("article_id", articleId)
      .maybeSingle(),
    admin
      .from("article_headline_options")
      .select("id, text, selected, rationale, order_idx")
      .eq("article_id", articleId)
      .order("order_idx"),
    admin
      .from("article_interlinks")
      .select("id, target_url, anchor_text, kind, notes")
      .eq("article_id", articleId),
    admin
      .from("article_review")
      .select("*")
      .eq("article_id", articleId)
      .maybeSingle(),
    admin
      .from("article_pre_publish")
      .select("*")
      .eq("article_id", articleId)
      .maybeSingle(),
    admin
      .from("pre_publish_failures")
      .select("*")
      .eq("article_id", articleId)
      .order("created_at"),
    admin
      .from("article_standing_rule_sweep")
      .select("*")
      .eq("article_id", articleId)
      .maybeSingle(),
    admin
      .from("article_reasonable_steps")
      .select("*")
      .eq("article_id", articleId)
      .maybeSingle(),
    admin
      .from("article_failure_log")
      .select("*")
      .eq("article_id", articleId)
      .order("created_at"),
    admin
      .from("article_artefact_sweep")
      .select("*")
      .eq("article_id", articleId)
      .maybeSingle(),
    admin
      .from("article_publish_log")
      .select("*")
      .eq("article_id", articleId)
      .order("attempted_at", { ascending: false }),
  ]);

  return {
    article,
    defamation_tier: defTier,
    framing_brief: brief,
    sources: (sources ?? []) as ArticleBundle["sources"],
    quotes: (quotes ?? []) as ArticleBundle["quotes"],
    research: research as ArticleBundle["research"],
    headlines: (headlinesRows ?? []).map((h) => ({
      id: (h as Record<string, unknown>).id as string | undefined,
      text: String((h as Record<string, unknown>).text ?? ""),
      selected: Boolean((h as Record<string, unknown>).selected),
      rationale: ((h as Record<string, unknown>).rationale as string | null) ?? null,
    })),
    interlinks: ((interlinks ?? []) as ArticleBundle["interlinks"]),
    review: review as ArticleBundle["review"],
    preP: preP as ArticleBundle["preP"],
    internal_failures: (internalFailures ?? []) as ArticleBundle["internal_failures"],
    standing_rule: standingRule as ArticleBundle["standing_rule"],
    reasonable_steps: reasonableSteps as ArticleBundle["reasonable_steps"],
    failure_log: (failureLog ?? []) as ArticleBundle["failure_log"],
    artefact_sweep: artefactSweep as ArticleBundle["artefact_sweep"],
    publish_log: (publishLog ?? []) as ArticleBundle["publish_log"],
  };
}

/* -------------------------------------------------------------------------- */
/*  renderPack — main entry point                                             */
/* -------------------------------------------------------------------------- */

export async function renderPack(fd: FormData): Promise<RenderPackResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const pack_ref = String(fd.get("pack_ref") ?? "").trim();
  if (!pack_ref) return { ok: false, error: "Missing pack_ref" };

  const admin = createServiceClient();
  const uid = await currentUserId();

  const { data: pack } = await admin
    .from("pre_publish_packs")
    .select(
      "pack_ref, article_1_id, article_2_id, article_3_id, origin_sweep_id, archive_path, pub_verdict, pub_verdict_at, pub_verdict_by, pub_verdict_notes",
    )
    .eq("pack_ref", pack_ref)
    .maybeSingle<{
      pack_ref: string;
      article_1_id: string | null;
      article_2_id: string | null;
      article_3_id: string | null;
      origin_sweep_id: string | null;
      archive_path: string | null;
      pub_verdict: string | null;
      pub_verdict_at: string | null;
      pub_verdict_by: string | null;
      pub_verdict_notes: string | null;
    }>();
  if (!pack) return { ok: false, error: "Pack not found" };

  const articleIds = [pack.article_1_id, pack.article_2_id, pack.article_3_id].filter(
    (x): x is string => Boolean(x),
  );
  if (articleIds.length === 0) {
    return { ok: false, error: "Pack contains no articles." };
  }

  // Resolve the renderer's name (best-effort).
  let renderedByName: string | null = null;
  if (uid) {
    const { data: me } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", uid)
      .maybeSingle<{ full_name: string | null }>();
    renderedByName = me?.full_name ?? null;
  }

  const bundles = await Promise.all(
    articleIds.map((id) => loadArticleBundle(admin, id)),
  );
  const articles = bundles.filter((b): b is ArticleBundle => Boolean(b));
  if (articles.length === 0) {
    return { ok: false, error: "Pack articles all failed to load." };
  }

  const now = new Date().toISOString();
  const bundle: PackBundle = {
    pack_ref,
    rendered_at: now,
    rendered_by_name: renderedByName,
    origin_sweep_id: pack.origin_sweep_id,
    senior_verdict: pack.pub_verdict,
    senior_verdict_at: pack.pub_verdict_at,
    senior_verdict_by: pack.pub_verdict_by,
    senior_verdict_notes: pack.pub_verdict_notes,
    articles,
  };

  const markdown = renderPackMarkdown(bundle);
  const signature = createHash("sha256").update(markdown).digest("hex");
  const archivePath =
    pack.archive_path ?? `workspace/pre_publish_packs/${pack_ref}.md`;

  // Persist to DB.
  const { error: upErr } = await admin
    .from("pre_publish_packs")
    .update({
      archive_markdown: markdown,
      archive_signature: signature,
      archive_path: archivePath,
      rendered_at: now,
      rendered_by: uid,
      updated_at: now,
    })
    .eq("pack_ref", pack_ref);
  if (upErr) return { ok: false, error: upErr.message };

  // Best-effort disk write — succeeds in dev, swallowed in production where
  // the filesystem is read-only.
  try {
    const fsPath = path.resolve(process.cwd(), archivePath);
    await mkdir(path.dirname(fsPath), { recursive: true });
    await writeFile(fsPath, markdown, "utf8");
  } catch {
    /* read-only fs — DB copy is authoritative */
  }

  revalidatePath(`/pre-publish-packs/${pack_ref}`);
  for (const id of articleIds) {
    revalidatePath(`/articles/${id}/pre-publish`);
    revalidatePath(`/articles/${id}`);
  }

  return {
    ok: true,
    pack_ref,
    signature,
    bytes: Buffer.byteLength(markdown, "utf8"),
  };
}
