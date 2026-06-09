import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SweepRunRow = {
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

type OpsRow = {
  id: string;
  code: string;
  issue_type: string;
  severity: "p1" | "p2" | "p3";
  status: "open" | "investigating" | "deferred" | "resolved" | "escalated";
  created_at: string;
  description: string;
  source_id: string | null;
  owner_id: string | null;
};

type SourceRow = {
  id: string;
  name: string;
  code: string;
  status: "active" | "warning" | "critical" | "paused";
};

type CandidateRow = {
  triage_state: string;
  dedup_state: string;
};

const ISSUE_LABEL: Record<string, string> = {
  parse_failure: "Parse",
  unreachable: "Unreachable",
  rate_limit: "Rate limit",
  schema_drift: "Schema",
  volume_anomaly: "Volume",
  wordpress_check: "WP check",
  config: "Config",
  timeout: "Timeout",
};

const ISSUE_CHIP: Record<string, string> = {
  parse_failure: "border-warn/35 bg-warn/10 text-warn",
  unreachable: "border-destructive/35 bg-destructive/10 text-destructive",
  rate_limit: "border-state-comm/35 bg-state-comm/10 text-state-comm",
  schema_drift: "border-state-sub/35 bg-state-sub/10 text-state-sub",
  volume_anomaly: "border-state-legal/35 bg-state-legal/10 text-state-legal",
  wordpress_check: "border-um-muted/35 bg-um-muted/10 text-um-muted",
  config: "border-um-muted/35 bg-um-muted/10 text-um-muted",
  timeout: "border-state-filed/35 bg-state-filed/10 text-state-filed",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  investigating: "Investigating",
  deferred: "Deferred",
  resolved: "Resolved",
  escalated: "Escalated",
};

const STATUS_PILL: Record<string, string> = {
  open: "border-destructive/30 bg-destructive/10 text-destructive",
  investigating: "border-warn/30 bg-warn/10 text-warn",
  deferred: "border-um-muted/30 bg-um-muted/10 text-um-muted",
  resolved: "border-success/30 bg-success/10 text-success",
  escalated: "border-destructive/40 bg-destructive/12 text-destructive",
};

const SWEEP_BADGE: Record<string, string> = {
  complete: "border-success/35 bg-success/10 text-success",
  running: "border-state-comm/35 bg-state-comm/10 text-state-comm",
  partial: "border-warn/35 bg-warn/10 text-warn",
  failed: "border-destructive/35 bg-destructive/10 text-destructive",
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false }).slice(0, 8);
}

function fmtDur(s: number | null): string {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) /
      86_400_000,
  );
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

function pct(n: number, total: number): string {
  if (!total) return "—";
  return `${((n / total) * 100).toFixed(1)}%`;
}

export default async function DiscoveryOverviewPage() {
  const supabase = await createClient();

  const [runsRes, opsRes, sourcesRes, candidatesRes] = await Promise.all([
    supabase
      .from("sweep_runs")
      .select(
        "id, code, slot, status, started_at, completed_at, duration_seconds, sites_total, reached_with_items, reached_no_items, parse_failures, not_reached, candidates_total, dedup_holds",
      )
      .order("started_at", { ascending: false })
      .limit(10),
    supabase
      .from("ops_rr_alerts")
      .select(
        "id, code, issue_type, severity, status, created_at, description, source_id, owner_id",
      )
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("discovery_sources")
      .select("id, name, code, status")
      .order("name", { ascending: true }),
    supabase
      .from("candidates")
      .select("triage_state, dedup_state"),
  ]);

  const runs: SweepRunRow[] = runsRes.data ?? [];
  const ops: OpsRow[] = opsRes.data ?? [];
  const sources: SourceRow[] = sourcesRes.data ?? [];
  const candidates: CandidateRow[] = candidatesRes.data ?? [];

  // Today's runs (started today, local)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayRuns = runs.filter((r) => new Date(r.started_at) >= todayStart);

  const todayCandTotal = todayRuns.reduce((a, r) => a + r.candidates_total, 0);
  const openOps = ops.filter((o) => o.status === "open" || o.status === "investigating");
  const unassignedOpen = ops.filter((o) => o.status === "open" && !o.owner_id);
  const parseIssues = ops.filter(
    (o) => o.issue_type === "parse_failure" && (o.status === "open" || o.status === "investigating"),
  );
  const unreachableOps = ops.filter(
    (o) => o.issue_type === "unreachable" && (o.status === "open" || o.status === "investigating"),
  );
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  // Candidate flow buckets
  const flowDiscovered = candidates.length;
  const flowDuplicated = candidates.filter((c) => c.dedup_state === "duplicate").length;
  const flowDeduplicated = flowDiscovered - flowDuplicated;
  const flowReady = candidates.filter((c) => c.triage_state === "ready").length;
  const flowSentToF1 = candidates.filter((c) => c.triage_state === "sent_to_f1").length;
  const flowEscalated = candidates.filter((c) => c.triage_state === "escalated").length;
  const flowAccepted = flowSentToF1 + flowEscalated;
  const flowRejected = candidates.filter(
    (c) => c.triage_state === "held_dedup" || c.triage_state === "held_source",
  ).length;
  const flowTriaged = flowAccepted + flowRejected;
  const acceptanceRate = flowTriaged ? (flowAccepted / flowTriaged) * 100 : 0;
  const dedupRate = flowDiscovered ? (flowDuplicated / flowDiscovered) * 100 : 0;

  // Source health: derived from status field
  const healthOk = sources.filter((s) => s.status === "active").length;
  const healthWarn = sources.filter((s) => s.status === "warning").length;
  const healthFail = sources.filter((s) => s.status === "critical" || s.status === "paused").length;

  return (
    <div className="flex h-full flex-col">
      {/* KPI strip */}
      <div className="grid flex-shrink-0 grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-3 lg:grid-cols-6">
        <Kpi value={todayCandTotal} label="Candidates surfaced" sub="Today's sweeps" href="/discovery/inbox" />
        <Kpi
          value={flowReady}
          label="Awaiting triage"
          sub={flowReady ? "in inbox" : "all clear"}
          tone={flowReady > 50 ? "warn" : undefined}
          href="/discovery/inbox"
        />
        <Kpi
          value={parseIssues.length}
          label="Parse failures"
          sub={`${new Set(parseIssues.map((o) => o.source_id)).size} sources affected`}
          tone={parseIssues.length ? "warn" : undefined}
          href="/discovery/ops-rr"
        />
        <Kpi
          value={unreachableOps.length}
          label="Unreachable sites"
          sub="Last sweep"
          tone={unreachableOps.length ? "warn" : undefined}
          href="/system/source-health"
        />
        <Kpi
          value={openOps.length}
          label="Open OPS-RR alerts"
          sub={`${unassignedOpen.length} unassigned`}
          tone={openOps.length ? "warn" : undefined}
          href="/discovery/ops-rr"
        />
        <Kpi
          value={ops.filter((o) => o.status === "escalated").length}
          label="REC-ESC escalations"
          sub="Last 24h"
          tone={ops.some((o) => o.status === "escalated") ? "danger" : undefined}
          href="/discovery/ops-rr"
        />
      </div>

      {/* Body 2-col */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: sweeps + flow + issues */}
        <div className="flex flex-1 flex-col overflow-y-auto border-r border-border">
          {/* Sweep runs */}
          <SecHead label="Sweep Runs — Today" linkLabel="Sweep detail →" linkHref="/discovery/sweeps" />
          <div className="grid grid-cols-1 gap-3 px-5 pb-5 xl:grid-cols-2">
            {todayRuns.length === 0 ? (
              <div className="col-span-full rounded-md border border-border bg-card px-4 py-6 text-center text-[12.5px] text-um-muted">
                No sweeps yet today.
              </div>
            ) : (
              todayRuns.map((r) => <SweepCard key={r.id} run={r} />)
            )}
          </div>

          {/* Candidate flow */}
          <SecHead label="Candidate Flow — Today" linkLabel="Open inbox →" linkHref="/discovery/inbox" />
          <div className="px-5 pb-5">
            <div className="rounded-md border border-border bg-card p-4">
              <div className="flex items-stretch gap-1 overflow-x-auto">
                <FlowStep value={flowDiscovered} label="Discovered" />
                <FlowStep value={flowDeduplicated} label="Deduplicated" drop={-flowDuplicated} />
                <FlowStep value={flowDeduplicated} label="Scored" />
                <FlowStep value={flowReady + flowTriaged} label="Queued for triage" accent drop={-(flowDeduplicated - (flowReady + flowTriaged))} />
                <FlowStep value={flowTriaged} label="Triaged" />
                <FlowStep value={flowAccepted} label="Accepted" tone="success" />
                <FlowStep value={flowRejected} label="Rejected" tone="danger" />
              </div>
              <div className="mt-3 flex flex-wrap gap-4 border-t border-border pt-3 text-[11px] text-um-muted">
                <Stat label="Acceptance rate" value={`${acceptanceRate.toFixed(1)}%`} />
                <Stat label="Dedup rate" value={`${dedupRate.toFixed(1)}%`} />
                <Stat label="Untriaged" value={flowReady.toString()} tone={flowReady ? "warn" : undefined} />
                <Stat label="Avg triage time" value="—" mono />
              </div>
            </div>
          </div>

          {/* Operational issues */}
          <SecHead label="Operational Issues" linkLabel="OPS-RR queue →" linkHref="/discovery/ops-rr" />
          <div className="px-5 pb-6">
            <div className="overflow-hidden rounded-md border border-border bg-card">
              {ops.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12.5px] text-um-muted">
                  No operational issues raised.
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <Th>Issue ID</Th>
                      <Th>Type</Th>
                      <Th>Source</Th>
                      <Th>Raised</Th>
                      <Th>Status</Th>
                      <Th>Assignee</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.slice(0, 6).map((o) => {
                      const src = o.source_id ? sourceById.get(o.source_id) : null;
                      return (
                        <tr key={o.id} className="border-b border-border last:border-b-0">
                          <td className="px-3 py-2.5 font-mono text-[11.5px] tabular-nums text-foreground">
                            {o.code}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                                ISSUE_CHIP[o.issue_type] ?? "border-border text-um-muted",
                              )}
                            >
                              {ISSUE_LABEL[o.issue_type] ?? o.issue_type}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-[12px] text-fg-2">
                            {src?.name ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-[11.5px] text-um-muted">
                            {relTime(o.created_at)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                                STATUS_PILL[o.status],
                              )}
                            >
                              {STATUS_LABEL[o.status] ?? o.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-[11.5px]">
                            {o.owner_id ? (
                              <span className="text-fg-2">Assigned</span>
                            ) : (
                              <span className="italic text-um-muted">Unassigned</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: recent runs + source health */}
        <aside className="hidden w-[300px] flex-shrink-0 flex-col overflow-y-auto bg-card lg:flex xl:w-[340px]">
          <RPanelHead title="Recent Runs" />
          <ul>
            {runs.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 border-b border-border px-4 py-2 text-[12px] last:border-b-0"
              >
                <span className="font-mono text-[11.5px] font-semibold tabular-nums text-foreground">
                  {r.code}
                </span>
                <span
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em]",
                    r.slot === "am"
                      ? "bg-state-legal/15 text-state-legal"
                      : "bg-state-sub/15 text-state-sub",
                  )}
                >
                  {r.slot}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-mono text-[10.5px] tabular-nums text-fg-2">
                    {fmtTime(r.started_at)}
                  </span>
                  <span className="text-[10px] text-um-muted">{dayLabel(r.started_at)}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-mono text-[10.5px] tabular-nums text-fg-2">
                    {r.candidates_total} cands
                  </span>
                  <span
                    className={cn(
                      "text-[10px]",
                      r.parse_failures + r.not_reached > 5
                        ? "text-destructive"
                        : r.parse_failures + r.not_reached > 0
                          ? "text-warn"
                          : "text-um-muted",
                    )}
                  >
                    {r.parse_failures + r.not_reached} issues
                  </span>
                </div>
                <span
                  className={cn(
                    "ml-2 rounded-sm border px-1 py-0.5 text-[9.5px] font-medium",
                    SWEEP_BADGE[r.status],
                  )}
                  title={r.status}
                >
                  {r.status === "complete"
                    ? "✓"
                    : r.status === "running"
                      ? "…"
                      : r.status === "partial"
                        ? "~"
                        : "✕"}
                </span>
              </li>
            ))}
          </ul>

          <RPanelHead title="Source Health" linkLabel="Monitor →" linkHref="/system/source-health" />
          <div className="border-b border-border bg-background px-4 py-2 text-[10.5px]">
            <div className="flex items-center gap-3">
              <SrcLegend tone="ok" label="OK" count={healthOk} />
              <SrcLegend tone="warn" label="Warn" count={healthWarn} />
              <SrcLegend tone="fail" label="Critical" count={healthFail} />
            </div>
          </div>
          <ul>
            {sources.slice(0, 15).map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 border-b border-border px-4 py-2 text-[12px] last:border-b-0"
              >
                <span
                  className={cn(
                    "h-2 w-2 flex-shrink-0 rounded-full",
                    s.status === "active" && "bg-success",
                    s.status === "warning" && "bg-warn",
                    (s.status === "critical" || s.status === "paused") && "bg-destructive",
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-fg-2">{s.name}</span>
                <span className="font-mono text-[10.5px] uppercase tracking-wider text-um-muted">
                  {s.code}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function Kpi({
  value,
  label,
  sub,
  tone,
  href,
}: {
  value: number | string;
  label: string;
  sub?: string;
  tone?: "warn" | "danger";
  href?: string;
}) {
  const valClass =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-warn" : "text-foreground";
  const inner = (
    <div className="flex h-full flex-col gap-1 bg-card px-4 py-3 transition-colors hover:bg-secondary">
      <span className={cn("font-mono text-[24px] font-semibold leading-none tabular-nums", valClass)}>
        {value}
      </span>
      <span className="text-[11.5px] font-medium text-foreground">{label}</span>
      {sub ? <span className="text-[10.5px] text-um-muted">{sub}</span> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function SecHead({
  label,
  linkLabel,
  linkHref,
}: {
  label: string;
  linkLabel?: string;
  linkHref?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-card px-5 py-2.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
        {label}
      </span>
      {linkLabel && linkHref ? (
        <Link href={linkHref} className="text-[11px] font-medium text-primary hover:underline">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

function SweepCard({ run }: { run: SweepRunRow }) {
  const slotLabel = run.slot === "am" ? "AM sweep" : "PM sweep";
  const isRunning = run.status === "running";
  return (
    <div className="rounded-md border border-border bg-card p-3.5">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground">
          {fmtTime(run.started_at).slice(0, 5)}
        </span>
        <span className="text-[12px] font-medium text-fg-2">
          {slotLabel} · {run.sites_total} sources
        </span>
        <span
          className={cn(
            "ml-auto rounded-full border px-2 py-0.5 text-[10.5px] font-medium capitalize",
            SWEEP_BADGE[run.status],
          )}
        >
          {run.status}
        </span>
      </div>

      <div className="space-y-1.5">
        <Outcome dot="ok" label="Reached with items" count={run.reached_with_items} total={run.sites_total} running={isRunning} />
        <Outcome dot="mute" label="Reached, no items" count={run.reached_no_items} total={run.sites_total} running={isRunning} />
        <Outcome dot="warn" label="Parse failure" count={run.parse_failures} total={run.sites_total} running={isRunning} />
        <Outcome dot="fail" label="Not reached" count={run.not_reached} total={run.sites_total} running={isRunning} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-[11px]">
        <span className="text-fg-2">
          <strong className="font-mono font-semibold tabular-nums text-foreground">
            {run.candidates_total}
          </strong>{" "}
          candidates {isRunning ? "so far" : "surfaced"}
        </span>
        <span className="text-um-muted">
          {isRunning ? "Elapsed" : "Duration"}: {fmtDur(run.duration_seconds)}
        </span>
      </div>
    </div>
  );
}

function Outcome({
  dot,
  label,
  count,
  total,
  running,
}: {
  dot: "ok" | "mute" | "warn" | "fail";
  label: string;
  count: number;
  total: number;
  running: boolean;
}) {
  const dotClass =
    dot === "ok"
      ? "bg-success"
      : dot === "warn"
        ? "bg-warn"
        : dot === "fail"
          ? "bg-destructive"
          : "bg-um-muted";
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", dotClass)} />
      <span className="flex-1 text-fg-2">{label}</span>
      <span className="font-mono font-semibold tabular-nums text-foreground">{count}</span>
      <span className="w-12 text-right font-mono text-[10.5px] tabular-nums text-um-muted">
        {running ? "—" : pct(count, total)}
      </span>
    </div>
  );
}

function FlowStep({
  value,
  label,
  drop,
  accent,
  tone,
}: {
  value: number;
  label: string;
  drop?: number;
  accent?: boolean;
  tone?: "success" | "danger";
}) {
  const bubbleClass = accent
    ? "border-primary/40 bg-primary/12 text-foreground"
    : tone === "success"
      ? "border-success/40 bg-success/10 text-success"
      : tone === "danger"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border bg-secondary text-foreground";
  return (
    <div className="relative flex min-w-[78px] flex-1 flex-col items-center gap-1.5 px-1 py-1">
      <span
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-full border font-mono text-[12px] font-semibold tabular-nums",
          bubbleClass,
        )}
      >
        {value}
      </span>
      <span className="text-center text-[10px] font-medium leading-tight text-fg-2">
        {label}
      </span>
      {drop && drop !== 0 ? (
        <span className="font-mono text-[10px] tabular-nums text-destructive">
          {drop > 0 ? `+${drop}` : drop}
        </span>
      ) : (
        <span className="h-3" />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: "warn";
  mono?: boolean;
}) {
  return (
    <span>
      {label}:{" "}
      <strong
        className={cn(
          "font-semibold tabular-nums",
          tone === "warn" ? "text-warn" : "text-fg-2",
          mono && "font-mono",
        )}
      >
        {value}
      </strong>
    </span>
  );
}

function RPanelHead({
  title,
  linkLabel,
  linkHref,
}: {
  title: string;
  linkLabel?: string;
  linkHref?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
        {title}
      </span>
      {linkLabel && linkHref ? (
        <Link href={linkHref} className="text-[10.5px] font-medium text-primary hover:underline">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

function SrcLegend({ tone, label, count }: { tone: "ok" | "warn" | "fail"; label: string; count: number }) {
  const dot =
    tone === "ok" ? "bg-success" : tone === "warn" ? "bg-warn" : "bg-destructive";
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      <span className="text-um-muted">{label}</span>
      <span className="font-mono tabular-nums text-fg-2">{count}</span>
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="bg-secondary/60 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-um-muted">
      {children}
    </th>
  );
}
