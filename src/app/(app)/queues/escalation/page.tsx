import Link from "next/link";
import {
  AlertOctagon,
  ChevronLeft,
  FileText,
  Gavel,
  Link2,
  Package,
  Siren,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * /queues/escalation — D0 Escalation [ESC] channel.
 *
 * Surfaces every article currently parked on a Admin escalation. Per
 * spec, three agents can fire an [ESC] verdict:
 *
 *   - F4 Interlink             → article_interlinker.verdict = 'escalate'
 *   - F6 Final Review         → article_review.verdict = 'escalate'
 *   - F7 Pre-Flight Pack       → article_pre_flight.f7_verdict = 'escalate'
 *
 * The queue merges all three sources, tags each row with the originating
 * agent, and shows the escalation rationale. Editors deep-link to the
 * relevant agent screen to resolve.
 *
 * D0 (D-Steps doctrine) treats unresolvable cases as the Admin's
 * call — never silently demoted. Read-only here; resolution happens on the
 * F-agent screen.
 */

type EscalationSource = "f4" | "f6" | "f7";

const SOURCE_META: Record<
  EscalationSource,
  {
    label: string;
    short: string;
    hint: string;
    icon: typeof Gavel;
  }
> = {
  f4: {
    label: "F4 Interlink",
    short: "F4 · ESC",
    hint: "Interlink cannot resolve — no candidate fits, anchor not natural.",
    icon: Link2,
  },
  f6: {
    label: "F6 Final Review",
    short: "F6 · ESC",
    hint: "Final Review cannot resolve at H-gates — Admin judgement call.",
    icon: Gavel,
  },
  f7: {
    label: "F7 Pre-Flight",
    short: "F7 · ESC",
    hint: "Pre-Flight Pack agent cannot resolve at A-checks — Admin judgement call.",
    icon: Package,
  },
};

type EscalationRow = {
  source: EscalationSource;
  id: string;
  headline: string;
  standfirst: string | null;
  state: string;
  verdictLabel: string;
  rationale: string | null;
  verdictAt: string | null;
  deepLink: string;
};

export default async function EscalationQueuePage() {
  const supabase = await createClient();

  type ReviewLite = {
    article_id: string;
    verdict: string | null;
    verdict_at: string | null;
    verdict_rationale: string | null;
  };
  type InterlinkerLite = {
    article_id: string;
    verdict: string | null;
    verdict_at: string | null;
    verdict_rationale: string | null;
  };
  type PreFlightLite = {
    article_id: string;
    verdict: string | null;
    verdict_at: string | null;
    verdict_rationale: string | null;
  };
  type ArticleRow = {
    id: string;
    headline: string;
    standfirst: string | null;
    state: string;
  };

  // Pull every active [ESC] verdict in parallel.
  const [f4Res, f6Res, f7Res] = await Promise.all([
    supabase
      .from("article_interlinker")
      .select("article_id, verdict, verdict_at, verdict_rationale")
      .eq("verdict", "escalate")
      .order("verdict_at", { ascending: false })
      .returns<InterlinkerLite[]>(),
    supabase
      .from("article_review")
      .select("article_id, verdict, verdict_at, verdict_rationale")
      .eq("verdict", "escalate")
      .order("verdict_at", { ascending: false })
      .returns<ReviewLite[]>(),
    supabase
      .from("article_pre_flight")
      .select("article_id, verdict, verdict_at, verdict_rationale")
      .eq("verdict", "escalate")
      .order("verdict_at", { ascending: false })
      .returns<PreFlightLite[]>(),
  ]);

  const f4Rows = f4Res.data ?? [];
  const f6Rows = f6Res.data ?? [];
  const f7Rows = f7Res.data ?? [];

  // Resolve article headlines.
  const articleIds = new Set<string>();
  for (const r of f4Rows) articleIds.add(r.article_id);
  for (const r of f6Rows) articleIds.add(r.article_id);
  for (const r of f7Rows) articleIds.add(r.article_id);
  const idList = Array.from(articleIds);

  const { data: articles } =
    idList.length === 0
      ? { data: [] as ArticleRow[] }
      : await supabase
          .from("articles")
          .select("id, headline, standfirst, state")
          .in("id", idList)
          .returns<ArticleRow[]>();
  const articleMap = new Map<string, ArticleRow>(
    (articles ?? []).map((a) => [a.id, a]),
  );

  const rows: EscalationRow[] = [];

  for (const r of f4Rows) {
    const a = articleMap.get(r.article_id);
    if (!a) continue;
    rows.push({
      source: "f4",
      id: a.id,
      headline: a.headline,
      standfirst: a.standfirst,
      state: a.state,
      verdictLabel: "ESCALATE",
      rationale: r.verdict_rationale,
      verdictAt: r.verdict_at,
      deepLink: `/articles/${a.id}/interlinks`,
    });
  }
  for (const r of f6Rows) {
    const a = articleMap.get(r.article_id);
    if (!a) continue;
    rows.push({
      source: "f6",
      id: a.id,
      headline: a.headline,
      standfirst: a.standfirst,
      state: a.state,
      verdictLabel: "ESCALATE",
      rationale: r.verdict_rationale,
      verdictAt: r.verdict_at,
      deepLink: `/articles/${a.id}/review`,
    });
  }
  for (const r of f7Rows) {
    const a = articleMap.get(r.article_id);
    if (!a) continue;
    rows.push({
      source: "f7",
      id: a.id,
      headline: a.headline,
      standfirst: a.standfirst,
      state: a.state,
      verdictLabel: "ESCALATE",
      rationale: r.verdict_rationale,
      verdictAt: r.verdict_at,
      deepLink: `/articles/${a.id}/pre-flight`,
    });
  }

  rows.sort((a, b) => (b.verdictAt ?? "").localeCompare(a.verdictAt ?? ""));

  const countF4 = f4Rows.length;
  const countF6 = f6Rows.length;
  const countF7 = f7Rows.length;
  const countAll = rows.length;

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
          D0 Escalation [ESC]
        </span>
        <span className="ml-auto rounded-md border border-warn/35 bg-warn/10 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-warn">
          Admin channel
        </span>
      </div>

      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-start gap-3">
          <Siren className="mt-1 h-4 w-4 flex-shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              D0 escalation channel · F4 · F6 · F7 · admin judgement
            </div>
            <h1 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground">
              Articles awaiting Admin [ESC] resolution
            </h1>
            <p className="mt-1 max-w-[760px] text-[12.5px] leading-[1.5] text-fg-2">
              D-Steps doctrine: cases an F-agent cannot resolve are escalated
              rather than silently demoted. Each row shows the originating
              agent and its rationale. Open the agent screen to resolve — the
              row drops off this queue when the verdict is replaced.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <SourceTotal source="f4" count={countF4} />
              <SourceTotal source="f6" count={countF6} />
              <SourceTotal source="f7" count={countF7} />
              <span className="ml-1 font-mono text-[10.5px] text-um-muted">
                · total {countAll}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-background px-6 py-5">
        <div className="mx-auto flex max-w-[960px] flex-col gap-2">
          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            rows.map((row) => (
              <EscalationCard
                key={`${row.source}-${row.id}-${row.verdictAt ?? ""}`}
                row={row}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SourceTotal({
  source,
  count,
}: {
  source: EscalationSource;
  count: number;
}) {
  const meta = SOURCE_META[source];
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-md border border-warn/35 bg-warn/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-warn",
      )}
      title={meta.hint}
    >
      <meta.icon className="h-3 w-3" />
      {meta.short} <span className="tabular-nums">· {count}</span>
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <AlertOctagon className="mb-3 h-7 w-7 text-um-muted/70" />
      <h2 className="text-[13px] font-semibold text-foreground">
        No active escalations
      </h2>
      <p className="mt-1 max-w-md text-[12px] leading-[1.5] text-um-muted">
        F4, F6 and F7 have nothing parked on the Admin channel.
      </p>
    </div>
  );
}

function EscalationCard({ row }: { row: EscalationRow }) {
  const meta = SOURCE_META[row.source];
  const Icon = meta.icon;

  return (
    <article className="overflow-hidden rounded-lg border border-warn/30 bg-card">
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline gap-2">
            <span
              className="rounded-md border border-warn/45 bg-warn/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-warn"
              title={meta.hint}
            >
              {meta.short}
            </span>
            <span className="font-mono text-[10.5px] text-um-muted">
              state · {row.state}
            </span>
            {row.verdictAt ? (
              <span className="ml-auto font-mono text-[10.5px] text-um-muted">
                {new Date(row.verdictAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </div>

          <Link href={`/articles/${row.id}`} className="group block">
            <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-[1.3] text-foreground group-hover:text-primary">
              {row.headline}
            </h3>
          </Link>
          {row.standfirst ? (
            <p className="mt-1 line-clamp-2 text-[12px] leading-[1.5] text-fg-2">
              {row.standfirst}
            </p>
          ) : null}

          {row.rationale ? (
            <p className="mt-2 rounded-md border border-warn/30 bg-warn/5 px-2.5 py-1.5 text-[11.5px] leading-[1.5] text-foreground">
              <span className="mr-1 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-warn">
                Rationale
              </span>
              {row.rationale}
            </p>
          ) : (
            <p className="mt-2 text-[11.5px] italic text-um-muted">
              No rationale captured — open the {meta.label} screen to inspect.
            </p>
          )}

          <div className="mt-2 flex items-center gap-1.5">
            <Link
              href={row.deepLink}
              className="flex h-6 items-center gap-1.5 rounded-md border border-warn/35 bg-warn/10 px-2 text-[11px] font-medium text-warn hover:bg-warn/15"
            >
              <Icon className="h-3 w-3" />
              Resolve in {meta.label}
            </Link>
            <Link
              href={`/articles/${row.id}`}
              className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-fg-2 hover:bg-secondary"
            >
              <FileText className="h-3 w-3" />
              Open dossier
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
