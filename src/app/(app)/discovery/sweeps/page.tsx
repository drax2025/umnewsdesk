import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SweepRun = {
  id: string;
  code: string;
  slot: "am" | "pm";
  status: "running" | "complete" | "partial" | "failed";
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  sites_total: number;
  reached_with_items: number;
  reached_no_items: number;
  parse_failures: number;
  not_reached: number;
  candidates_total: number;
  dedup_holds: number;
};

type SiteResult = {
  id: string;
  source_id: string;
  outcome: "reached_items" | "reached_empty" | "parse_failure" | "not_reached";
  http_status: number | null;
  candidate_count: number;
  parse_issue_count: number;
  failure_streak: number;
  resolved_primary_url: string | null;
};

type SourceRow = {
  id: string;
  name: string;
  code: string;
  layer: "l1" | "l2" | "l3" | "l4";
  feed_url: string;
};

type Candidate = {
  id: string;
  code: string;
  working_headline: string;
  source_id: string | null;
  triage_state: string;
  risk: "low" | "med" | "high";
};

type AlertRow = {
  id: string;
  code: string;
  source_id: string | null;
  issue_type: string;
  severity: "p1" | "p2" | "p3";
  status: string;
};

const SWEEP_BADGE: Record<string, string> = {
  complete: "border-success/35 bg-success/10 text-success",
  running: "border-state-comm/35 bg-state-comm/10 text-state-comm",
  partial: "border-warn/35 bg-warn/10 text-warn",
  failed: "border-destructive/35 bg-destructive/10 text-destructive",
};

const OUTCOME_CHIP: Record<string, string> = {
  reached_items: "border-success/35 bg-success/10 text-success",
  reached_empty: "border-um-muted/35 bg-um-muted/10 text-um-muted",
  parse_failure: "border-warn/35 bg-warn/10 text-warn",
  not_reached: "border-destructive/35 bg-destructive/10 text-destructive",
};

const OUTCOME_LABEL: Record<string, string> = {
  reached_items: "Reached · items",
  reached_empty: "Reached · empty",
  parse_failure: "Parse failure",
  not_reached: "Not reached",
};

const RISK_PILL: Record<string, string> = {
  high: "bg-destructive/15 text-destructive",
  med: "bg-warn/15 text-warn",
  low: "bg-um-muted/15 text-um-muted",
};

const TRIAGE_PILL: Record<string, string> = {
  ready: "border-success/35 bg-success/10 text-success",
  held_dedup: "border-warn/35 bg-warn/10 text-warn",
  held_source: "border-state-legal/35 bg-state-legal/10 text-state-legal",
  needs_review: "border-destructive/35 bg-destructive/10 text-destructive",
  pointer: "border-um-muted/35 bg-um-muted/10 text-um-muted",
  sent_to_f1: "border-state-comm/35 bg-state-comm/10 text-state-comm",
  escalated: "border-destructive/40 bg-destructive/15 text-destructive",
};

const TRIAGE_LABEL: Record<string, string> = {
  ready: "Ready",
  held_dedup: "Held · dup",
  held_source: "Held · source",
  needs_review: "Needs review",
  pointer: "Pointer",
  sent_to_f1: "Sent · F1",
  escalated: "Escalated",
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · ${d
    .toLocaleTimeString("en-GB", { hour12: false })
    .slice(0, 8)}`;
}

function fmtDur(s: number | null): string {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  return `${m}m ${(s % 60).toString().padStart(2, "0")}s`;
}

function httpClass(code: number | null): string {
  if (!code) return "text-um-muted";
  if (code >= 200 && code < 300) return "text-success";
  if (code >= 300 && code < 400) return "text-state-filed";
  if (code >= 400 && code < 500) return "text-warn";
  return "text-destructive";
}

export default async function SweepRunDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: runs } = await supabase
    .from("sweep_runs")
    .select(
      "id, code, slot, status, started_at, completed_at, duration_seconds, sites_total, reached_with_items, reached_no_items, parse_failures, not_reached, candidates_total, dedup_holds",
    )
    .order("started_at", { ascending: false });

  const allRuns: SweepRun[] = runs ?? [];

  if (allRuns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-um-muted">
        No sweep runs recorded yet.
      </div>
    );
  }

  const activeId = sp.id ?? allRuns[0].id;
  if (!sp.id) redirect(`/discovery/sweeps?id=${allRuns[0].id}`);

  const run = allRuns.find((r) => r.id === activeId) ?? allRuns[0];

  const [siteRes, sourcesRes, candRes, alertRes] = await Promise.all([
    supabase
      .from("sweep_site_results")
      .select(
        "id, source_id, outcome, http_status, candidate_count, parse_issue_count, failure_streak, resolved_primary_url",
      )
      .eq("sweep_run_id", run.id),
    supabase.from("discovery_sources").select("id, name, code, layer, feed_url"),
    supabase
      .from("candidates")
      .select("id, code, working_headline, source_id, triage_state, risk")
      .eq("sweep_run_id", run.id)
      .order("surfaced_at", { ascending: false })
      .limit(20),
    supabase
      .from("ops_rr_alerts")
      .select("id, code, source_id, issue_type, severity, status")
      .eq("sweep_run_id", run.id),
  ]);

  const sites: SiteResult[] = siteRes.data ?? [];
  const sources: SourceRow[] = sourcesRes.data ?? [];
  const cands: Candidate[] = candRes.data ?? [];
  const alerts: AlertRow[] = alertRes.data ?? [];

  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  // Per-layer aggregation
  type LayerAgg = {
    layer: string;
    sites: number;
    reached: number;
    cands: number;
    parseFail: number;
    notReached: number;
    empty: number;
  };
  const layerAggs: Record<string, LayerAgg> = {};
  for (const l of ["l1", "l2", "l3", "l4"]) {
    layerAggs[l] = {
      layer: l,
      sites: 0,
      reached: 0,
      cands: 0,
      parseFail: 0,
      notReached: 0,
      empty: 0,
    };
  }
  for (const s of sites) {
    const src = sourceMap.get(s.source_id);
    if (!src) continue;
    const agg = layerAggs[src.layer];
    if (!agg) continue;
    agg.sites++;
    agg.cands += s.candidate_count;
    if (s.outcome === "reached_items") agg.reached++;
    if (s.outcome === "reached_empty") {
      agg.reached++;
      agg.empty++;
    }
    if (s.outcome === "parse_failure") agg.parseFail++;
    if (s.outcome === "not_reached") agg.notReached++;
  }

  // KPIs
  const reachedPct = run.sites_total
    ? ((run.reached_with_items + run.reached_no_items) / run.sites_total) * 100
    : 0;
  const itemsScraped = sites.reduce((a, s) => a + s.candidate_count, 0);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Run picker */}
      <aside className="hidden w-[200px] flex-shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex flex-shrink-0 items-center border-b border-border px-4 py-2.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
            All Sweeps
          </span>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {allRuns.map((r) => {
            const isActive = r.id === activeId;
            return (
              <li key={r.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/discovery/sweeps?id=${r.id}`}
                  className={cn(
                    "flex flex-col gap-1 px-4 py-2.5 transition-colors hover:bg-secondary",
                    isActive && "bg-secondary",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11.5px] font-semibold tabular-nums text-foreground">
                      {r.code}
                    </span>
                    <span
                      className={cn(
                        "ml-auto rounded-sm px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em]",
                        r.slot === "am"
                          ? "bg-state-legal/15 text-state-legal"
                          : "bg-state-sub/15 text-state-sub",
                      )}
                    >
                      {r.slot}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] tabular-nums text-um-muted">
                      {new Date(r.started_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                    <span
                      className={cn(
                        "ml-auto rounded-sm border px-1 py-0.5 text-[9px] font-medium capitalize",
                        SWEEP_BADGE[r.status],
                      )}
                    >
                      {r.status === "complete"
                        ? "✓"
                        : r.status === "running"
                          ? "…"
                          : r.status === "partial"
                            ? "~"
                            : "✕"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
          <div className="mb-3 flex items-start gap-4">
            <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">
              {run.code}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-[15px] font-semibold text-foreground">
                {run.slot === "am" ? "Morning sweep" : "Afternoon sweep"} ·{" "}
                {new Date(run.started_at).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </h1>
              <p className="mt-0.5 text-[11.5px] text-um-muted">
                Started {fmtDateTime(run.started_at)} ·{" "}
                {run.completed_at ? `completed ${fmtDateTime(run.completed_at)}` : "in progress"}
              </p>
            </div>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize",
                SWEEP_BADGE[run.status],
              )}
            >
              {run.status}
            </span>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4 lg:grid-cols-6">
            <KpiCell label="Sources" value={run.sites_total} />
            <KpiCell
              label="Reached"
              value={`${run.reached_with_items + run.reached_no_items}`}
              sub={`${reachedPct.toFixed(0)}%`}
              tone={reachedPct < 90 ? "warn" : undefined}
            />
            <KpiCell label="Items scraped" value={itemsScraped} />
            <KpiCell label="Candidates" value={run.candidates_total} sub={`${run.dedup_holds} held`} />
            <KpiCell
              label="Failures"
              value={run.parse_failures + run.not_reached}
              tone={run.parse_failures + run.not_reached ? "warn" : undefined}
            />
            <KpiCell label="Duration" value={fmtDur(run.duration_seconds)} mono />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Per-layer summary */}
          <SecHead label="Per-layer summary" />
          <div className="mb-6 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {Object.values(layerAggs).map((a) => (
              <LayerCard key={a.layer} agg={a} />
            ))}
          </div>

          {/* Site outcomes */}
          <SecHead
            label="Site outcomes"
            meta={`${sites.length} sources`}
            link={{ label: "Source Health →", href: "/system/source-health" }}
          />
          <div className="mb-6 overflow-hidden rounded-md border border-border bg-card">
            {sites.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12.5px] text-um-muted">
                No site results recorded for this run.
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    <Th>Source</Th>
                    <Th>Layer</Th>
                    <Th>Outcome</Th>
                    <Th>HTTP</Th>
                    <Th className="text-right">Candidates</Th>
                    <Th>Streak</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => {
                    const src = sourceMap.get(s.source_id);
                    const hasAlert = alerts.some(
                      (a) => a.source_id === s.source_id && a.status !== "resolved",
                    );
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-border transition-colors last:border-b-0 hover:bg-secondary"
                      >
                        <td className="max-w-[280px] truncate px-3 py-2 font-mono text-[11.5px] text-fg-2">
                          {src?.name ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded-sm border border-border-mid bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-2">
                            {src?.layer ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                              OUTCOME_CHIP[s.outcome],
                            )}
                          >
                            {OUTCOME_LABEL[s.outcome]}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "font-mono text-[11px] font-semibold tabular-nums",
                              httpClass(s.http_status),
                            )}
                          >
                            {s.http_status ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[11.5px] tabular-nums text-fg-2">
                          {s.candidate_count}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "font-mono text-[11px] tabular-nums",
                              s.failure_streak >= 3
                                ? "text-destructive"
                                : s.failure_streak > 0
                                  ? "text-warn"
                                  : "text-um-muted",
                            )}
                          >
                            {s.failure_streak}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {hasAlert ? (
                            <Link
                              href="/discovery/ops-rr"
                              className="text-[11px] font-medium text-warn hover:underline"
                            >
                              Open OPS-RR →
                            </Link>
                          ) : s.candidate_count > 0 ? (
                            <Link
                              href="/discovery/inbox"
                              className="text-[11px] font-medium text-primary hover:underline"
                            >
                              View in inbox
                            </Link>
                          ) : (
                            <Link
                              href="/system/source-health"
                              className="text-[11px] font-medium text-um-muted hover:underline"
                            >
                              Source health
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Candidates + Alerts */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* Candidates */}
            <div>
              <SecHead
                label="Candidates from this run"
                meta={`${run.candidates_total} total · ${cands.length} shown`}
                link={{ label: "Open inbox →", href: "/discovery/inbox" }}
              />
              <div className="overflow-hidden rounded-md border border-border bg-card">
                {cands.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[12.5px] text-um-muted">
                    No candidates surfaced from this run.
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-secondary/40">
                        <Th>ID</Th>
                        <Th>Headline</Th>
                        <Th>Risk</Th>
                        <Th>Triage</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {cands.map((c) => {
                        const src = c.source_id ? sourceMap.get(c.source_id) : null;
                        return (
                          <tr
                            key={c.id}
                            className="border-b border-border last:border-b-0 hover:bg-secondary"
                          >
                            <td className="px-3 py-2 font-mono text-[11px] font-semibold tabular-nums text-foreground">
                              {c.code}
                            </td>
                            <td className="max-w-[280px] truncate px-3 py-2 text-[12px] text-foreground">
                              {c.working_headline}
                              {src ? (
                                <span className="ml-2 text-[10.5px] text-um-muted">
                                  · {src.name}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={cn(
                                  "rounded-sm px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                                  RISK_PILL[c.risk],
                                )}
                              >
                                {c.risk}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={cn(
                                  "inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                                  TRIAGE_PILL[c.triage_state] ?? "border-border text-um-muted",
                                )}
                              >
                                {TRIAGE_LABEL[c.triage_state] ?? c.triage_state}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Alerts raised in this run */}
            <div>
              <SecHead
                label="Alerts raised this run"
                meta={`${alerts.length} alert${alerts.length === 1 ? "" : "s"}`}
                link={{ label: "OPS-RR queue →", href: "/discovery/ops-rr" }}
              />
              <div className="overflow-hidden rounded-md border border-border bg-card">
                {alerts.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[12.5px] text-um-muted">
                    Clean run — no alerts raised.
                  </div>
                ) : (
                  <ul>
                    {alerts.map((a) => {
                      const src = a.source_id ? sourceMap.get(a.source_id) : null;
                      return (
                        <li
                          key={a.id}
                          className="flex items-center gap-3 border-b border-border px-3 py-2.5 text-[11.5px] last:border-b-0"
                        >
                          <Link
                            href={`/discovery/ops-rr?status=${a.status}&id=${a.id}`}
                            className="font-mono font-semibold tabular-nums text-primary hover:underline"
                          >
                            {a.code}
                          </Link>
                          <span
                            className={cn(
                              "rounded-sm px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                              a.severity === "p1"
                                ? "bg-destructive/15 text-destructive"
                                : a.severity === "p2"
                                  ? "bg-warn/15 text-warn"
                                  : "bg-um-muted/15 text-um-muted",
                            )}
                          >
                            {a.severity}
                          </span>
                          <span className="flex-1 truncate text-fg-2">
                            {src?.name ?? "—"} · {a.issue_type.replace("_", " ")}
                          </span>
                          <span
                            className={cn(
                              "text-[10.5px] capitalize",
                              a.status === "resolved" ? "text-success" : "text-warn",
                            )}
                          >
                            {a.status}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  sub,
  tone,
  mono,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "warn" | "danger";
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-card px-3 py-2.5">
      <span
        className={cn(
          "text-[18px] font-semibold leading-none tabular-nums",
          mono ? "font-mono text-[15px]" : "font-mono",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-destructive",
          !tone && "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-[10.5px] font-medium text-fg-2">{label}</span>
      {sub ? <span className="text-[10px] text-um-muted">{sub}</span> : null}
    </div>
  );
}

function SecHead({
  label,
  meta,
  link,
}: {
  label: string;
  meta?: string;
  link?: { label: string; href: string };
}) {
  return (
    <div className="mb-3 flex items-center gap-3 border-b border-border pb-2">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
        {label}
      </span>
      {meta ? <span className="text-[10.5px] text-um-muted">{meta}</span> : null}
      {link ? (
        <Link href={link.href} className="ml-auto text-[11px] font-medium text-primary hover:underline">
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}

function LayerCard({
  agg,
}: {
  agg: {
    layer: string;
    sites: number;
    reached: number;
    cands: number;
    parseFail: number;
    notReached: number;
    empty: number;
  };
}) {
  const reachedTone = agg.sites === 0 ? "muted" : agg.reached === agg.sites ? "ok" : "warn";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-secondary font-mono text-[12px] font-bold text-foreground">
          {agg.layer.replace("l", "")}
        </span>
        <span className="text-[12px] font-medium text-foreground">
          {agg.layer === "l1"
            ? "Corporate"
            : agg.layer === "l2"
              ? "Institutional"
              : agg.layer === "l3"
                ? "National"
                : "Signal"}
        </span>
        <span className="ml-auto rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[9.5px] tabular-nums text-um-muted">
          {agg.sites} sites
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <LayerStat
          val={agg.reached.toString()}
          label="Reached"
          tone={reachedTone === "ok" ? "ok" : reachedTone === "warn" ? "warn" : undefined}
        />
        <LayerStat val={agg.cands.toString()} label="Cands" />
        <LayerStat
          val={agg.parseFail.toString()}
          label="Parse fail"
          tone={agg.parseFail > 0 ? "warn" : undefined}
        />
        <LayerStat
          val={agg.notReached.toString()}
          label="Down"
          tone={agg.notReached > 0 ? "danger" : undefined}
        />
      </div>
    </div>
  );
}

function LayerStat({ val, label, tone }: { val: string; label: string; tone?: "ok" | "warn" | "danger" }) {
  const c =
    tone === "ok"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="flex flex-col">
      <span className={cn("font-mono text-[14px] font-semibold leading-none tabular-nums", c)}>
        {val}
      </span>
      <span className="text-[10px] text-um-muted">{label}</span>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-um-muted",
        className,
      )}
    >
      {children}
    </th>
  );
}
