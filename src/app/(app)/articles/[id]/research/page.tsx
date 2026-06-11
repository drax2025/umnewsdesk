import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Compass, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { F2SourcePack } from "@/components/forms/f2-source-pack";
import { F2QuoteLedger } from "@/components/forms/f2-quote-ledger";
import { F2VerdictPanel } from "@/components/forms/f2-verdict-panel";
import { F2Opportunities } from "@/components/forms/f2-opportunities";
import {
  GEOGRAPHIC_TIERS,
  type FramingBrief,
} from "@/lib/spec/f1-triage";
import type {
  ArticleQuoteRow,
  ArticleResearchRow,
  ArticleSourceRow,
  PipelineOpportunityRow,
} from "@/lib/spec/f2-research";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * F2 Researcher screen — /articles/[id]/research.
 *
 * One page, vertical stack:
 *
 *   1. F1 recap card           — geographic tier, frame, tags, anchor, brief
 *   2. Source pack             — primary + independent + reply + ≤ 4 context
 *   3. Verbatim quote ledger   — B1 / C1 / C3 substrate
 *   4. Feasibility + verdict   — framing-feasibility, dependency, NFP, verdict
 *   5. B7 opportunities        — 4-5 follow-ups for the next F0
 *
 * The F1 recap is read-only here. To change it, the editor goes back to
 * /discovery/inbox and re-opens the F1 modal on the candidate row.
 */

type ArticleRow = {
  id: string;
  headline: string;
  standfirst: string | null;
  state: string;
};

type CandidateBrief = {
  framing_brief: FramingBrief | null;
};

export default async function F2ResearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  // Article
  const { data: article } = await supabase
    .from("articles")
    .select("id, headline, standfirst, state")
    .eq("id", id)
    .maybeSingle<ArticleRow>();
  if (!article) notFound();

  // Candidate framing brief (joined through commissions)
  const { data: commission } = await supabase
    .from("commissions")
    .select("candidate_id")
    .eq("article_id", id)
    .maybeSingle<{ candidate_id: string | null }>();

  let brief: FramingBrief | null = null;
  if (commission?.candidate_id) {
    const { data: cand } = await supabase
      .from("candidates")
      .select("framing_brief")
      .eq("id", commission.candidate_id)
      .maybeSingle<CandidateBrief>();
    brief = cand?.framing_brief ?? null;
  }

  // Sources, quotes, research, opportunities — fetched in parallel
  const [
    { data: sources },
    { data: quotes },
    { data: research },
    { data: opportunities },
  ] = await Promise.all([
    supabase
      .from("article_sources")
      .select(
        "id, article_id, kind, url, title, publisher, published_at, author, content, is_signal_only, is_paywalled, notes, order_idx, fetched_at",
      )
      .eq("article_id", id)
      .order("kind", { ascending: true })
      .order("order_idx", { ascending: true })
      .order("fetched_at", { ascending: true })
      .returns<ArticleSourceRow[]>(),
    supabase
      .from("article_quotes")
      .select(
        "id, article_id, source_id, quote_text, speaker, role, institution, order_idx, created_at",
      )
      .eq("article_id", id)
      .order("order_idx", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<ArticleQuoteRow[]>(),
    supabase
      .from("article_research")
      .select(
        "article_id, framing_feasibility, feasibility_evidence, dependency_status, primary_paywalled, nfp_footer_draft, verdict, verdict_at, verdict_rationale, updated_at",
      )
      .eq("article_id", id)
      .maybeSingle<ArticleResearchRow>(),
    supabase
      .from("article_pipeline_opportunities")
      .select("id, article_id, title, category, priority, notes, created_at")
      .eq("article_id", id)
      .order("priority", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .returns<PipelineOpportunityRow[]>(),
  ]);

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
          F2 Research
        </span>
      </div>

      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-start gap-3">
          <Compass className="mt-1 h-4 w-4 flex-shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              F2 Researcher
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
            href={`/articles/${article.id}/edit`}
            className="flex h-7 flex-shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
          >
            <FileText className="h-3.5 w-3.5" />
            Open in editor
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-background px-6 py-5">
        <div className="mx-auto flex max-w-[960px] flex-col gap-4">
          <F1Recap brief={brief} />

          <F2SourcePack articleId={article.id} sources={sources ?? []} />

          <F2QuoteLedger
            articleId={article.id}
            quotes={quotes ?? []}
            sources={sources ?? []}
          />

          <F2VerdictPanel articleId={article.id} research={research ?? null} />

          <F2Opportunities
            articleId={article.id}
            opportunities={opportunities ?? []}
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  F1 recap card (read-only summary of the inbox triage scorecard)           */
/* -------------------------------------------------------------------------- */

function F1Recap({ brief }: { brief: FramingBrief | null }) {
  if (!brief) {
    return (
      <section className="rounded-lg border border-warn/35 bg-warn/5 px-4 py-3">
        <div className="text-[11.5px] text-warn">
          No F1 framing brief on the source candidate. Researcher should ask
          the editor to complete the inbox scorecard before continuing.
        </div>
      </section>
    );
  }

  const geo = GEOGRAPHIC_TIERS.find((g) => g.value === brief.geographic_tier);

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[12.5px] font-semibold text-foreground">
            F1 framing recap
          </h2>
          <span className="text-[10.5px] text-um-muted">
            Inherited from inbox triage · read-only here
          </span>
        </div>
      </header>
      <div className="grid grid-cols-3 gap-3 px-4 py-3">
        <Field label="Geographic tier" value={geo?.label ?? "—"} mono />
        <Field label="Primary frame" value={brief.primary_frame ?? "—"} />
        <Field
          label="Category tags"
          value={
            brief.category_tags.length > 0 ? brief.category_tags.join(" · ") : "—"
          }
        />
        <div className="col-span-3">
          <FieldBlock
            label="Scottish anchor"
            value={brief.scottish_anchor ?? "—"}
          />
        </div>
        <div className="col-span-3">
          <FieldBlock
            label="Per-story brief"
            value={brief.per_story_brief ?? "—"}
          />
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-[12.5px] text-foreground",
          mono && "font-mono text-[11.5px] uppercase tracking-[0.02em]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function FieldBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
        {label}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-[1.5] text-foreground">
        {value}
      </p>
    </div>
  );
}
