import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Compass, Gavel, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { F6GateRow } from "@/components/forms/f6-gate-row";
import { F6H11Checklist } from "@/components/forms/f6-h11-checklist";
import { F6VerdictPanel } from "@/components/forms/f6-verdict-panel";
import {
  GATES,
  type ArticleReviewRow,
} from "@/lib/spec/f6-review";
import type { DefamationTier } from "@/lib/spec/f1-triage";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * F6 Reviewer screen — /articles/[id]/review.
 *
 * Top: article banner + roll-up of gate statuses
 * Body: 11 gate rows in sequence (H1-H10) + dedicated H11 checklist
 * Bottom: verdict stamp with seven options
 *
 * The defamation tier comes through commissions.candidate_id → candidates,
 * matching the F2 page's lookup pattern.
 */

type ArticleRow = {
  id: string;
  headline: string;
  standfirst: string | null;
  state: string;
};

export default async function F6ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select("id, headline, standfirst, state")
    .eq("id", id)
    .maybeSingle<ArticleRow>();
  if (!article) notFound();

  // Tier lookup via commissions → candidates.
  const { data: commission } = await supabase
    .from("commissions")
    .select("candidate_id")
    .eq("article_id", id)
    .maybeSingle<{ candidate_id: string | null }>();

  let defamationTier: DefamationTier | null = null;
  // PR pieces (production option 1 Direct Publish / 2 AI Rewrite) are routine
  // submitted content — F6 doesn't force a verdict rationale on them.
  let isPrPiece = false;
  if (commission?.candidate_id) {
    const { data: cand } = await supabase
      .from("candidates")
      .select("defamation_tier, production_option")
      .eq("id", commission.candidate_id)
      .maybeSingle<{
        defamation_tier: DefamationTier | null;
        production_option: number | null;
      }>();
    defamationTier = cand?.defamation_tier ?? null;
    isPrPiece =
      cand?.production_option === 1 || cand?.production_option === 2;
  }

  // Review row (one per article)
  const { data: review } = await supabase
    .from("article_review")
    .select("*")
    .eq("article_id", id)
    .maybeSingle<ArticleReviewRow>();

  const gatesExceptH11 = GATES.filter((g) => g.code !== "H11");

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
          F6 Review
        </span>
      </div>

      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-start gap-3">
          <Gavel className="mt-1 h-4 w-4 flex-shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              F6 Reviewer · H1-H11 gates
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
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <TierBadge tier={defamationTier} />
            <Link
              href={`/articles/${article.id}/research`}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <Compass className="h-3.5 w-3.5" />
              F2 Research
            </Link>
            <Link
              href={`/articles/${article.id}/edit`}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <Pencil className="h-3.5 w-3.5" />
              Open in editor
            </Link>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-background px-6 py-5">
        <div className="mx-auto flex max-w-[960px] flex-col gap-3">
          {/* Verdict / roll-up at the top (sticky-feeling) */}
          <F6VerdictPanel
            articleId={article.id}
            review={review ?? null}
            defamationTier={defamationTier}
            isPrPiece={isPrPiece}
          />

          {/* H1-H10 sequence */}
          <SectionHeader
            label="Hard gates (H1-H5, H10)"
            hint="Verbatim · source · paragraph breaks · register · dates · standing-rules. Any FAIL hard-returns the article."
          />
          {gatesExceptH11
            .filter((g) => g.kind === "hard")
            .map((g) => (
              <F6GateRow
                key={g.code}
                articleId={article.id}
                gate={g}
                review={review ?? null}
              />
            ))}

          <SectionHeader
            label="Soft gates (H6-H9)"
            hint="Word count · link integrity · headline length · NFP footer. Soft-fail is flagged in the pack but does not block."
          />
          {gatesExceptH11
            .filter((g) => g.kind === "soft")
            .map((g) => (
              <F6GateRow
                key={g.code}
                articleId={article.id}
                gate={g}
                review={review ?? null}
              />
            ))}

          <SectionHeader
            label="Defamation triage (H11)"
            hint="Tier 2 only. Tier 1 auto-N/A. Tier 3 routes to Reject Queue."
          />
          <F6H11Checklist
            articleId={article.id}
            defamationTier={defamationTier}
            review={review ?? null}
          />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="mt-2 flex items-baseline gap-2 px-1">
      <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
        {label}
      </h2>
      <span className="text-[10.5px] text-um-muted">· {hint}</span>
    </div>
  );
}

function TierBadge({ tier }: { tier: DefamationTier | null }) {
  if (tier === null) {
    return (
      <span className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-um-muted">
        Tier —
      </span>
    );
  }
  const tone =
    tier === 1
      ? "border-success/45 bg-success/10 text-success"
      : tier === 2
        ? "border-warn/45 bg-warn/10 text-warn"
        : "border-destructive/45 bg-destructive/10 text-destructive";
  const label =
    tier === 1 ? "Tier 1 — Standard" : tier === 2 ? "Tier 2 — Sensitive" : "Tier 3 — Hold";
  return (
    <span
      className={cn(
        "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold",
        tone,
      )}
    >
      {label}
    </span>
  );
}
