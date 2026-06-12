import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Globe2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ArtefactSweepPanel } from "@/components/forms/f8-artefact-sweep";
import { PublishPanel } from "@/components/forms/f8-publish-panel";
import type {
  ArticleArtefactSweepRow,
  ArticlePublishLogRow,
} from "@/lib/spec/f8-post-publish";

export const dynamic = "force-dynamic";

/**
 * F8 Post-Publish screen — /articles/[id]/post-publish.
 *
 * Two stages on one page:
 *
 *   1. Final 17-artefact sweep (Stage 1) — B2 confirmation before push
 *   2. Publish push (Stage 2)            — WordPress / WP draft / manual
 *
 * Entry state: 'scheduled' (set by senior PUB-PASS in F9).
 * Exit state:  'live' + published_at + master-inventory write-back.
 *
 * Wordpress credentials come from env: WORDPRESS_URL / WORDPRESS_USER /
 * WORDPRESS_APP_PASSWORD. Manual mode records an external URL.
 */

type ArticleRow = {
  id: string;
  headline: string;
  standfirst: string | null;
  state: string;
  slug: string | null;
  backdate: string | null;
};

type ProfileRow = { role: string | null };

export default async function F8PostPublishPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select("id, headline, standfirst, state, slug, backdate")
    .eq("id", id)
    .maybeSingle<ArticleRow>();
  if (!article) notFound();

  // Current user's role (publish push restricted to senior_editor).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let role: string | null = null;
  if (user) {
    const { data: me } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();
    role = me?.role ?? null;
  }
  const isSenior = role === "senior_editor";
  const isEditor = role === "editor" || role === "senior_editor";

  const [{ data: sweepRow }, { data: publishLog }] = await Promise.all([
    supabase
      .from("article_artefact_sweep")
      .select(
        "article_id, results, completed_at, completed_by, updated_at",
      )
      .eq("article_id", id)
      .maybeSingle<ArticleArtefactSweepRow>(),
    supabase
      .from("article_publish_log")
      .select(
        "id, article_id, target, status, external_id, external_url, error, payload, attempted_at, completed_at, created_by",
      )
      .eq("article_id", id)
      .order("attempted_at", { ascending: false })
      .returns<ArticlePublishLogRow[]>(),
  ]);

  const wordpressConfigured = Boolean(
    process.env.WORDPRESS_URL &&
      process.env.WORDPRESS_USER &&
      process.env.WORDPRESS_APP_PASSWORD,
  );

  return (
    <div className="flex h-full flex-col">
      {/* Sub-topbar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card px-5 py-2 text-[12px]">
        <Link
          href={`/articles/${article.id}`}
          className="flex items-center gap-1 text-fg-2 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Article dossier
        </Link>
        <span className="text-border-mid">/</span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          F8 Post-Publish
        </span>
      </div>

      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-start gap-3">
          <Globe2 className="mt-1 h-4 w-4 flex-shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              F8 Post-Publish · final sweep + WordPress push
            </div>
            <h1 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground">
              {article.headline}
            </h1>
            {article.standfirst ? (
              <p className="mt-1 text-[12.5px] leading-[1.5] text-fg-2">
                {article.standfirst}
              </p>
            ) : null}
          </div>
          <Link
            href={`/articles/${article.id}/pre-publish`}
            className="flex h-7 flex-shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            F9 pack
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-background px-6 py-5">
        <div className="mx-auto flex max-w-[960px] flex-col gap-4">
          {article.state !== "scheduled" && article.state !== "live" ? (
            <div className="rounded-md border border-warn/45 bg-warn/5 px-3 py-2 text-[11.5px] text-warn">
              Article state is <span className="font-mono">{article.state}</span>{" "}
              — F8 expects <span className="font-mono">scheduled</span> (after
              senior PUB-PASS). If the article is still pre-PASS, complete F9
              first.
            </div>
          ) : null}

          <ArtefactSweepPanel
            articleId={article.id}
            row={sweepRow ?? null}
            readOnly={!isEditor || article.state === "live"}
          />

          <PublishPanel
            articleId={article.id}
            articleState={article.state}
            defaultSlug={article.slug}
            backdate={article.backdate}
            sweepRow={sweepRow ?? null}
            publishLog={publishLog ?? []}
            wordpressConfigured={wordpressConfigured}
            readOnly={!isSenior}
          />
        </div>
      </div>
    </div>
  );
}
