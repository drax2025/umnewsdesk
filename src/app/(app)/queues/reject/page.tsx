import Link from "next/link";
import {
  Ban,
  ChevronLeft,
  FileText,
  Gavel,
  Package,
  ShieldAlert,
  ShieldX,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cn } from "@/lib/utils";
import type { RejectQueueSweepRow } from "@/lib/spec/a3-opportunities";
import { K5RejectSweepPanel } from "@/components/forms/k5-reject-sweep";

export const dynamic = "force-dynamic";

/**
 * /queues/reject — D-Reject queue.
 *
 * The D-Reject queue is the merged view of every article currently held back
 * for defamation / legality / framing reasons. Per spec:
 *
 *   1. Tier 3 candidates routed straight here from F1 (no production).
 *   2. F6 verdict = 'return_to_f1' on H11 failures — defamation triage failed
 *      (NO to Q3-Q9 or YES to Q10) and the spec routes these to Reject Queue.
 *   3. F7 article_pre_flight.pub_verdict = 'reject' — Admin REJECT.
 *   4. articles.state = 'rejected' — terminal reject state.
 *
 * Each row labels which agent stamped the rejection and the rationale. Editors
 * deep-link to the dossier; the queue is read-only.
 */

type TabKey = "live" | "tier3" | "all";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  {
    key: "live",
    label: "Active rejects",
    hint: "Articles rejected by F6 H11 fail, F7 [PUB] REJECT, a terminal state, or killed at the commissioning desk.",
  },
  {
    key: "tier3",
    label: "Tier 3 candidates",
    hint: "Candidates classified D-Tier 3 by F1 — never commissioned.",
  },
  { key: "all", label: "All", hint: "Live rejects + Tier 3 candidates combined." },
];

type RejectSource =
  | "state"
  | "killed"
  | "f6_h11"
  | "f9_pub_reject"
  | "tier3_candidate";

type SourceMeta = {
  label: string;
  short: string;
  hint: string;
  tone: "destructive" | "warn" | "muted";
  icon: typeof Gavel;
};

const SOURCE_META: Record<RejectSource, SourceMeta> = {
  state: {
    label: "Terminal reject",
    short: "STATE",
    hint: "articles.state = 'rejected'.",
    tone: "destructive",
    icon: XCircle,
  },
  killed: {
    label: "Killed at desk",
    short: "KILLED",
    hint: "Editor killed the whole story (e.g. unsuitable / wrong region).",
    tone: "destructive",
    icon: Ban,
  },
  f6_h11: {
    label: "F6 H11 fail",
    short: "F6 · H11",
    hint: "Reviewer routed to F1 on D-Checklist failure.",
    tone: "destructive",
    icon: Gavel,
  },
  f9_pub_reject: {
    label: "F7 [PUB] reject",
    short: "F7 · PUB",
    hint: "Admin stamped REJECT on the Pre-Publish Pack.",
    tone: "destructive",
    icon: Package,
  },
  tier3_candidate: {
    label: "Tier 3 candidate",
    short: "T3 · CAND",
    hint: "F1 triage classified D-Tier 3 — barred from commissioning.",
    tone: "warn",
    icon: ShieldX,
  },
};

const TONE_PILL: Record<SourceMeta["tone"], string> = {
  destructive: "border-destructive/45 bg-destructive/10 text-destructive",
  warn: "border-warn/45 bg-warn/10 text-warn",
  muted: "border-border-mid bg-secondary text-fg-2",
};

type ArticleRejectRow = {
  kind: "article";
  source: RejectSource;
  id: string;
  headline: string;
  standfirst: string | null;
  state: string;
  defamationTier: 1 | 2 | 3 | null;
  rationale: string | null;
  decidedAt: string | null;
};

type CandidateRejectRow = {
  kind: "candidate";
  source: "tier3_candidate";
  id: string;
  headline: string;
  blurb: string | null;
  defamationTier: 3;
  rationale: string | null;
  decidedAt: string | null;
  sourceDomain: string | null;
};

type RejectRow = ArticleRejectRow | CandidateRejectRow;

export default async function DRejectQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab: TabKey =
    sp.tab === "tier3" ? "tier3" : sp.tab === "all" ? "all" : "live";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: meRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<{ role: string | null }>();
  const isSenior = meRow?.role === "editor" || meRow?.role === "admin";

  /* ----------------------------------------------------------------------- */
  /*  Live rejects                                                           */
  /* ----------------------------------------------------------------------- */

  type ArticleRow = {
    id: string;
    headline: string;
    standfirst: string | null;
    state: string;
    updated_at: string;
  };

  type ReviewLite = {
    article_id: string;
    verdict: string | null;
    verdict_at: string | null;
    verdict_rationale: string | null;
    h11_status: string | null;
  };

  type PrePublishLite = {
    article_id: string;
    pub_verdict: string | null;
    pub_verdict_at: string | null;
    pub_verdict_notes: string | null;
  };

  type CommissionLite = {
    article_id: string;
    candidate_id: string | null;
  };

  type CandidateTier = {
    id: string;
    defamation_tier: number | null;
  };

  // Three independent queries, then merge.
  const [stateRes, reviewRes, ppRes] = await Promise.all([
    supabase
      .from("articles")
      .select("id, headline, standfirst, state, updated_at")
      .in("state", ["rejected", "killed"])
      .order("updated_at", { ascending: false })
      .returns<ArticleRow[]>(),
    supabase
      .from("article_review")
      .select("article_id, verdict, verdict_at, verdict_rationale, h11_status")
      .eq("verdict", "return_to_f1")
      .order("verdict_at", { ascending: false })
      .returns<ReviewLite[]>(),
    supabase
      .from("article_pre_flight")
      .select("article_id, pub_verdict, pub_verdict_at, pub_verdict_notes")
      .eq("pub_verdict", "reject")
      .order("pub_verdict_at", { ascending: false })
      .returns<PrePublishLite[]>(),
  ]);

  const stateArticles = stateRes.data ?? [];
  const reviewArticles = reviewRes.data ?? [];
  const ppArticles = ppRes.data ?? [];

  // Kill reasons: when an article is killed from the commissioning desk the
  // rationale is logged to approval_decisions (to_state='killed'). Pull the most
  // recent one per article so the queue can show why it was spiked.
  const killedIds = stateArticles
    .filter((a) => a.state === "killed")
    .map((a) => a.id);
  const { data: killDecisions } =
    killedIds.length === 0
      ? { data: [] as { article_id: string; rationale: string; decided_at: string }[] }
      : await supabase
          .from("approval_decisions")
          .select("article_id, rationale, decided_at")
          .eq("to_state", "killed")
          .in("article_id", killedIds)
          .order("decided_at", { ascending: false })
          .returns<{ article_id: string; rationale: string; decided_at: string }[]>();
  const killReasonByArticle = new Map<string, { rationale: string; decidedAt: string }>();
  for (const d of killDecisions ?? []) {
    if (!killReasonByArticle.has(d.article_id)) {
      killReasonByArticle.set(d.article_id, {
        rationale: d.rationale,
        decidedAt: d.decided_at,
      });
    }
  }

  // Resolve headlines / standfirsts for review + pp article ids that aren't
  // already in state list.
  const knownIds = new Set(stateArticles.map((a) => a.id));
  const extraIds = new Set<string>();
  for (const r of reviewArticles) if (!knownIds.has(r.article_id)) extraIds.add(r.article_id);
  for (const p of ppArticles) if (!knownIds.has(p.article_id)) extraIds.add(p.article_id);
  const extraIdList = Array.from(extraIds);

  const { data: extraArticles } =
    extraIdList.length === 0
      ? { data: [] as ArticleRow[] }
      : await supabase
          .from("articles")
          .select("id, headline, standfirst, state, updated_at")
          .in("id", extraIdList)
          .returns<ArticleRow[]>();

  const articleMap = new Map<string, ArticleRow>();
  for (const a of stateArticles) articleMap.set(a.id, a);
  for (const a of extraArticles ?? []) articleMap.set(a.id, a);

  // Defamation tier resolution: articles → commissions → candidates.defamation_tier.
  const allArticleIds = Array.from(articleMap.keys());
  const { data: commissions } =
    allArticleIds.length === 0
      ? { data: [] as CommissionLite[] }
      : await supabase
          .from("commissions")
          .select("article_id, candidate_id")
          .in("article_id", allArticleIds)
          .returns<CommissionLite[]>();
  const candidateIds = Array.from(
    new Set(
      (commissions ?? [])
        .map((c) => c.candidate_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const { data: candidates } =
    candidateIds.length === 0
      ? { data: [] as CandidateTier[] }
      : await supabase
          .from("candidates")
          .select("id, defamation_tier")
          .in("id", candidateIds)
          .returns<CandidateTier[]>();

  const cidByArticle = new Map<string, string>();
  for (const c of commissions ?? []) {
    if (c.candidate_id) cidByArticle.set(c.article_id, c.candidate_id);
  }
  const tierByCandidate = new Map<string, number | null>();
  for (const c of candidates ?? []) tierByCandidate.set(c.id, c.defamation_tier);

  function tierFor(articleId: string): 1 | 2 | 3 | null {
    const cid = cidByArticle.get(articleId);
    if (!cid) return null;
    const t = tierByCandidate.get(cid);
    if (t === 1 || t === 2 || t === 3) return t;
    return null;
  }

  // Build live reject rows. An article may appear once per source — that's
  // useful: it tells the editor every reason the article landed here.
  const liveRows: ArticleRejectRow[] = [];
  for (const r of reviewArticles) {
    const a = articleMap.get(r.article_id);
    if (!a) continue;
    liveRows.push({
      kind: "article",
      source: "f6_h11",
      id: a.id,
      headline: a.headline,
      standfirst: a.standfirst,
      state: a.state,
      defamationTier: tierFor(a.id),
      rationale: r.verdict_rationale,
      decidedAt: r.verdict_at,
    });
  }
  for (const p of ppArticles) {
    const a = articleMap.get(p.article_id);
    if (!a) continue;
    liveRows.push({
      kind: "article",
      source: "f9_pub_reject",
      id: a.id,
      headline: a.headline,
      standfirst: a.standfirst,
      state: a.state,
      defamationTier: tierFor(a.id),
      rationale: p.pub_verdict_notes,
      decidedAt: p.pub_verdict_at,
    });
  }
  for (const a of stateArticles) {
    if (a.state === "killed") {
      const kr = killReasonByArticle.get(a.id);
      liveRows.push({
        kind: "article",
        source: "killed",
        id: a.id,
        headline: a.headline,
        standfirst: a.standfirst,
        state: a.state,
        defamationTier: tierFor(a.id),
        rationale: kr?.rationale ?? null,
        decidedAt: kr?.decidedAt ?? a.updated_at,
      });
    } else {
      liveRows.push({
        kind: "article",
        source: "state",
        id: a.id,
        headline: a.headline,
        standfirst: a.standfirst,
        state: a.state,
        defamationTier: tierFor(a.id),
        rationale: null,
        decidedAt: a.updated_at,
      });
    }
  }

  // Most-recent first.
  liveRows.sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));

  /* ----------------------------------------------------------------------- */
  /*  Tier 3 candidates                                                      */
  /* ----------------------------------------------------------------------- */

  type CandidateRow = {
    id: string;
    working_headline: string | null;
    summary: string | null;
    primary_url: string | null;
    defamation_tier: number | null;
    surfaced_at: string | null;
    updated_at: string | null;
  };

  const { data: tier3 } = await supabase
    .from("candidates")
    .select(
      "id, working_headline, summary, primary_url, defamation_tier, surfaced_at, updated_at",
    )
    .eq("defamation_tier", 3)
    .order("updated_at", { ascending: false })
    .limit(100)
    .returns<CandidateRow[]>();

  function hostFor(url: string | null): string | null {
    if (!url) return null;
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  const tier3Rows: CandidateRejectRow[] = (tier3 ?? []).map((c) => ({
    kind: "candidate",
    source: "tier3_candidate",
    id: c.id,
    headline: c.working_headline ?? "(untitled candidate)",
    blurb: c.summary,
    defamationTier: 3,
    rationale: null,
    decidedAt: c.updated_at ?? c.surfaced_at,
    sourceDomain: hostFor(c.primary_url),
  }));

  /* ----------------------------------------------------------------------- */
  /*  Pick rows for active tab                                               */
  /* ----------------------------------------------------------------------- */

  const visibleRows: RejectRow[] =
    tab === "live"
      ? liveRows
      : tab === "tier3"
        ? tier3Rows
        : [...liveRows, ...tier3Rows].sort((a, b) =>
            (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""),
          );

  const liveCount = liveRows.length;
  const tier3Count = tier3Rows.length;
  const allCount = liveCount + tier3Count;

  /* ----------------------------------------------------------------------- */
  /*  K5 reject-queue sweep history (senior-only verdict surface)            */
  /* ----------------------------------------------------------------------- */

  const articleRowIds = Array.from(
    new Set(
      visibleRows
        .filter((r): r is ArticleRejectRow => r.kind === "article")
        .map((r) => r.id),
    ),
  );
  const admin = createServiceClient();
  const { data: sweepsRaw } = articleRowIds.length
    ? await admin
        .from("reject_queue_sweep")
        .select("id, article_id, verdict, notes, swept_at, swept_by, iteration")
        .in("article_id", articleRowIds)
        .order("iteration", { ascending: false })
        .returns<RejectQueueSweepRow[]>()
    : { data: [] };
  const sweepByArticle = new Map<string, RejectQueueSweepRow[]>();
  for (const s of sweepsRaw ?? []) {
    const list = sweepByArticle.get(s.article_id) ?? [];
    list.push(s);
    sweepByArticle.set(s.article_id, list);
  }

  const countFor = (key: TabKey) =>
    key === "live" ? liveCount : key === "tier3" ? tier3Count : allCount;

  return (
    <div className="flex h-full flex-col">
      {/* Sub-topbar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card px-5 py-2 text-[12px]">
        <Link
          href="/"
          className="flex items-center gap-1 text-fg-2 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>
        <span className="text-border-mid">/</span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          D-Reject queue
        </span>
        <span className="ml-auto rounded-md border border-destructive/35 bg-destructive/10 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-destructive">
          Read-only
        </span>
      </div>

      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-1 h-4 w-4 flex-shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              D-Reject queue · defamation triage failures · Admin rejects · Tier 3 holds
            </div>
            <h1 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground">
              Articles held back on D-Steps grounds
            </h1>
            <p className="mt-1 max-w-[760px] text-[12.5px] leading-[1.5] text-fg-2">
              Combines four sources: <span className="font-mono">articles.state=&apos;rejected&apos;</span>,
              F6 verdict <span className="font-mono">return_to_f1</span> (H11 fail),
              F7 [PUB] verdict <span className="font-mono">reject</span>, and F1
              candidates classified D-Tier 3. Per Reasonable Steps Doctrine,
              rejected work is preserved in audit — never silently deleted.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0 border-b border-border bg-card px-4">
        {TABS.map((t) => {
          const isActive = t.key === tab;
          const count = countFor(t.key);
          return (
            <Link
              key={t.key}
              href={`/queues/reject?tab=${t.key}`}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[11.5px] font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-fg-2 hover:text-foreground",
              )}
              title={t.hint}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full border px-1.5 font-mono text-[10px] tabular-nums leading-[1.7]",
                  isActive
                    ? "border-primary/35 bg-accent text-primary"
                    : "border-border bg-background text-um-muted",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-background px-6 py-5">
        <div className="mx-auto flex max-w-[960px] flex-col gap-2">
          {visibleRows.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            visibleRows.map((row) => (
              <RejectRowCard
                key={`${row.source}-${row.id}`}
                row={row}
                sweeps={
                  row.kind === "article"
                    ? (sweepByArticle.get(row.id) ?? [])
                    : []
                }
                canSweep={isSenior}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <ShieldAlert className="mb-3 h-7 w-7 text-um-muted/70" />
      <h2 className="text-[13px] font-semibold text-foreground">
        {tab === "live"
          ? "No active rejects"
          : tab === "tier3"
            ? "No Tier 3 candidates"
            : "Reject queue is empty"}
      </h2>
      <p className="mt-1 max-w-md text-[12px] leading-[1.5] text-um-muted">
        {tab === "live"
          ? "Nothing is currently sitting in articles.state=rejected, F6 H11 fail, or F7 [PUB] REJECT."
          : tab === "tier3"
            ? "F1 has not classified any candidates D-Tier 3 in the last 100 candidates."
            : "Nothing rejected anywhere in the pipeline."}
      </p>
    </div>
  );
}

function RejectRowCard({
  row,
  sweeps,
  canSweep,
}: {
  row: RejectRow;
  sweeps: RejectQueueSweepRow[];
  canSweep: boolean;
}) {
  const meta = SOURCE_META[row.source];
  const Icon = meta.icon;
  const href =
    row.kind === "article"
      ? `/articles/${row.id}`
      : `/discovery/inbox?candidate=${row.id}`;

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline gap-2">
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.05em]",
                TONE_PILL[meta.tone],
              )}
              title={meta.hint}
            >
              {meta.short}
            </span>
            {row.defamationTier ? (
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.05em]",
                  row.defamationTier === 3
                    ? "border-destructive/45 bg-destructive/10 text-destructive"
                    : row.defamationTier === 2
                      ? "border-warn/45 bg-warn/10 text-warn"
                      : "border-border-mid bg-secondary text-fg-2",
                )}
              >
                D-Tier {row.defamationTier}
              </span>
            ) : null}
            {row.kind === "article" ? (
              <span className="font-mono text-[10.5px] text-um-muted">
                state · {row.state}
              </span>
            ) : row.sourceDomain ? (
              <span className="font-mono text-[10.5px] text-um-muted">
                src · {row.sourceDomain}
              </span>
            ) : null}
            {row.decidedAt ? (
              <span className="ml-auto font-mono text-[10.5px] text-um-muted">
                {new Date(row.decidedAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </div>

          <Link href={href} className="group block">
            <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-[1.3] text-foreground group-hover:text-primary">
              {row.headline}
            </h3>
          </Link>
          {row.kind === "article" && row.standfirst ? (
            <p className="mt-1 line-clamp-2 text-[12px] leading-[1.5] text-fg-2">
              {row.standfirst}
            </p>
          ) : null}
          {row.kind === "candidate" && row.blurb ? (
            <p className="mt-1 line-clamp-2 text-[12px] leading-[1.5] text-fg-2">
              {row.blurb}
            </p>
          ) : null}

          {row.rationale ? (
            <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11.5px] leading-[1.5] text-foreground">
              <span className="mr-1 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-destructive">
                Rationale
              </span>
              {row.rationale}
            </p>
          ) : null}

          <div className="mt-2 flex items-center gap-1.5">
            <Link
              href={href}
              className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-fg-2 hover:bg-secondary"
            >
              <FileText className="h-3 w-3" />
              {row.kind === "article" ? "Open dossier" : "Open candidate"}
            </Link>
            {row.kind === "article" ? (
              <>
                <Link
                  href={`/articles/${row.id}/review`}
                  className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-fg-2 hover:bg-secondary"
                >
                  <Gavel className="h-3 w-3" />
                  F6 Review
                </Link>
                <Link
                  href={`/articles/${row.id}/pre-flight`}
                  className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-fg-2 hover:bg-secondary"
                >
                  <Package className="h-3 w-3" />
                  F7 Pre-Flight
                </Link>
              </>
            ) : null}
          </div>

          {row.kind === "article" && canSweep ? (
            <K5RejectSweepPanel
              articleId={row.id}
              latest={sweeps[0] ?? null}
              history={sweeps}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}
