import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Compass, Gavel, Package, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { F9CheckRow } from "@/components/forms/f9-check-row";
import { F9FailureLog } from "@/components/forms/f9-failure-log";
import { F9PackPanel } from "@/components/forms/f9-pack-panel";
import { F9VerdictPanel } from "@/components/forms/f9-verdict-panel";
import { StandingRuleSweep } from "@/components/forms/f9-standing-rule-sweep";
import { ReasonableStepsLog } from "@/components/forms/f9-reasonable-steps";
import { FailureLogPanel } from "@/components/forms/failure-log-panel";
import {
  A_CHECKS,
  type ArticlePrePublishRow,
  type PrePublishFailureRow,
  type PrePublishPackRow,
} from "@/lib/spec/f9-pre-publish";
import type { ArticleStandingRuleSweepRow } from "@/lib/spec/f9-standing-rule";
import type { ArticleReasonableStepsRow } from "@/lib/spec/f9-reasonable-steps";
import type { ArticleFailureLogRow } from "@/lib/spec/failure-log";

export const dynamic = "force-dynamic";

/**
 * F9 Pre-Publish screen — /articles/[id]/pre-publish.
 *
 * Layout:
 *
 *   Sub-topbar  · back to dossier
 *   Header      · F9 label, headline, link to F6 / editor, pack ref pill
 *   Verdict     · A-check roll-up + 7 verdict buttons
 *   A1-A6 hard  · the six hard-fail checks
 *   A7-A9 soft  · interlink / footer
 *   A10 hard    · standing-rule sweep + numeric positive trace
 *   Failure Log · append rows for SOFT/HARD fails
 *   Pack panel  · assembly + [PUB] Senior Editor verdict
 *
 * F9 sits between F6 and F8. Per spec sections F9, A1-A10, D-Steps.
 */

type ArticleRow = {
  id: string;
  headline: string;
  standfirst: string | null;
  state: string;
};

type ProfileRow = { role: string | null };

export default async function F9PrePublishPage({
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

  // Current user's role (gates the [PUB] verdict form).
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
  const canStampPub = role === "senior_editor";

  // The pre-publish row, failures and (optionally) the pack.
  const [
    { data: row },
    { data: failures },
    { data: sweepRow },
    { data: reasonableStepsRow },
    { data: failureLog },
    { data: commission },
  ] = await Promise.all([
    supabase
      .from("article_pre_publish")
      .select("*")
      .eq("article_id", id)
      .maybeSingle<ArticlePrePublishRow>(),
    supabase
      .from("pre_publish_failures")
      .select("*")
      .eq("article_id", id)
      .order("created_at", { ascending: false })
      .returns<PrePublishFailureRow[]>(),
    supabase
      .from("article_standing_rule_sweep")
      .select("*")
      .eq("article_id", id)
      .maybeSingle<ArticleStandingRuleSweepRow>(),
    supabase
      .from("article_reasonable_steps")
      .select("*")
      .eq("article_id", id)
      .maybeSingle<ArticleReasonableStepsRow>(),
    supabase
      .from("article_failure_log")
      .select("*")
      .eq("article_id", id)
      .order("created_at", { ascending: false })
      .returns<ArticleFailureLogRow[]>(),
    supabase
      .from("commissions")
      .select("candidate_id")
      .eq("article_id", id)
      .maybeSingle<{ candidate_id: string | null }>(),
  ]);

  // Resolve defamation tier via candidate (canonical pattern).
  let defamationTier: 1 | 2 | 3 | null = null;
  if (commission?.candidate_id) {
    const { data: cand } = await supabase
      .from("candidates")
      .select("defamation_tier")
      .eq("id", commission.candidate_id)
      .maybeSingle<{ defamation_tier: number | null }>();
    const t = cand?.defamation_tier;
    if (t === 1 || t === 2 || t === 3) defamationTier = t;
  }

  let pack: PrePublishPackRow | null = null;
  if (row?.pack_ref) {
    const { data: packRow } = await supabase
      .from("pre_publish_packs")
      .select("*")
      .eq("pack_ref", row.pack_ref)
      .maybeSingle<PrePublishPackRow>();
    pack = packRow ?? null;
  }

  const hardChecks = A_CHECKS.filter((c) => c.kind === "hard");
  const softChecks = A_CHECKS.filter((c) => c.kind === "soft");

  // Show A1-A6 hard rows, then A7+A9 soft rows, then A10 hard sweep separately
  // (per spec line 107 it deserves its own emphasis).
  const hardEarly = hardChecks.filter((c) => c.code !== "A10");
  const a10 = hardChecks.find((c) => c.code === "A10");

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
          F9 Pre-Publish
        </span>
      </div>

      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-start gap-3">
          <Package className="mt-1 h-4 w-4 flex-shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              F9 Pre-Publish · A1-A10 active checks · D-Steps doctrine
            </div>
            <h1 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground">
              {article.headline}
            </h1>
            {article.standfirst ? (
              <p className="mt-1 text-[12.5px] leading-[1.5] text-fg-2">
                {article.standfirst}
              </p>
            ) : null}
            {row?.pack_ref ? (
              <p className="mt-1 font-mono text-[10.5px] text-um-muted">
                pack {row.pack_ref}
                {row.pack_archive_path ? (
                  <span> · {row.pack_archive_path}</span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <Link
              href={`/articles/${article.id}/research`}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <Compass className="h-3.5 w-3.5" />
              F2 Research
            </Link>
            <Link
              href={`/articles/${article.id}/review`}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <Gavel className="h-3.5 w-3.5" />
              F6 Review
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
          {/* Verdict / roll-up at the top */}
          <F9VerdictPanel
            articleId={article.id}
            row={row ?? null}
            defamationTier={defamationTier}
          />

          {/* Hard checks A1-A6 */}
          <SectionHeader
            label="Hard active checks (A1-A6)"
            hint="Source reverify · primary-record sampling · structure · backdate. Any FAIL hard-returns the article to the upstream agent."
          />
          {hardEarly.map((c) => (
            <F9CheckRow
              key={c.code}
              articleId={article.id}
              check={c}
              row={row ?? null}
            />
          ))}

          {/* Soft checks A7+A9 */}
          <SectionHeader
            label="Soft active checks (A7, A9)"
            hint="Interlink resolution · NFP footer completeness. Soft-fail is flagged in the pack but does not block hand-off."
          />
          {softChecks.map((c) => (
            <F9CheckRow
              key={c.code}
              articleId={article.id}
              check={c}
              row={row ?? null}
            />
          ))}

          {/* A8 hard — framing alignment */}
          <SectionHeader
            label="Framing alignment (A8)"
            hint="Headline length ≤ 90 chars and faithful to the F1 framing brief."
          />
          {hardChecks
            .filter((c) => c.code === "A8")
            .map((c) => (
              <F9CheckRow
                key={c.code}
                articleId={article.id}
                check={c}
                row={row ?? null}
              />
            ))}

          {/* A10 standing-rule sweep — own section per spec line 107 */}
          <SectionHeader
            label="Standing-rule sweep + numeric positive trace (A10)"
            hint="B1-B7 each CHECKED-PASS / N/A-with-justification. Every numeric claim has a positive trace to source — not just no red flags."
          />
          {a10 ? (
            <F9CheckRow
              articleId={article.id}
              check={a10}
              row={row ?? null}
            />
          ) : null}

          {/* Pack section 10 standing-rule compliance table */}
          <SectionHeader
            label="Standing-Rule Compliance · pack section 10"
            hint="B1-B7 + Section M + Section L sweep. Every row must be CHECKED-PASS / CHECKED-FAIL / N/A-with-justification before F9 returns PASS."
          />
          <StandingRuleSweep
            articleId={article.id}
            row={sweepRow ?? null}
          />

          {/* Pack section 8 reasonable-steps log (Tier 2 only) */}
          <SectionHeader
            label="Reasonable-steps log · pack section 8"
            hint="D-Steps doctrine — required for every Tier 2 article. Tier 1 not applicable; Tier 3 disqualified upstream."
          />
          <ReasonableStepsLog
            articleId={article.id}
            row={reasonableStepsRow ?? null}
            defamationTier={defamationTier}
          />

          {/* Pack section 0 — cross-agent failure log */}
          <SectionHeader
            label="Article Failure Log · pack section 0"
            hint="Cross-agent chronological record (F1 / F2 / F3 / F4 / F5 / F6 / F9). Read BEFORE article content in the pack."
          />
          <FailureLogPanel
            articleId={article.id}
            rows={failureLog ?? []}
          />

          {/* F9-internal A-check failure log (pre_publish_failures) */}
          <SectionHeader
            label="A-check Failure Log (F9 internal)"
            hint="One row per A1-A10 soft-fail / hard-fail. Routed through SK-RECORD.append-failure-log-row."
          />
          <F9FailureLog articleId={article.id} failures={failures ?? []} />

          {/* Pack assembly + [PUB] verdict */}
          <SectionHeader
            label="Pre-Publish Pack"
            hint="Hard cap of 3 articles per pack. Stamped to [PUB] for Senior Editor APPROVE / MODIFY / REJECT."
          />
          <F9PackPanel
            articleId={article.id}
            row={row ?? null}
            pack={pack}
            canStampPub={canStampPub}
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
