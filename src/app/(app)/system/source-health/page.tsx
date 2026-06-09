import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SourceRow = {
  id: string;
  code: string;
  name: string;
  feed_url: string;
  crawl_method: string | null;
  layer: "l1" | "l2" | "l3" | "l4";
  stream_id: string | null;
  status: "active" | "warning" | "critical" | "paused";
  exclusivity_window_hours: number;
  signal_only_eligible: boolean;
  monitored_since: string;
  paused_until: string | null;
};

type StreamRow = { id: string; name: string };
type SiteResult = {
  source_id: string;
  outcome: "reached_items" | "reached_empty" | "parse_failure" | "not_reached";
  candidate_count: number;
  failure_streak: number;
  created_at: string;
};

type Alert = {
  source_id: string | null;
  status: string;
  issue_type: string;
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  warning: "Warning",
  critical: "Critical",
  paused: "Paused",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-success",
  warning: "bg-warn",
  critical: "bg-destructive",
  paused: "bg-um-muted",
};

const STATUS_PILL: Record<string, string> = {
  active: "border-success/30 bg-success/10 text-success",
  warning: "border-warn/30 bg-warn/10 text-warn",
  critical: "border-destructive/30 bg-destructive/10 text-destructive",
  paused: "border-um-muted/30 bg-um-muted/10 text-um-muted",
};

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function SourceHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; layer?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const layer = sp.layer ?? "all";

  const supabase = await createClient();
  const [srcRes, streamRes, recentRes, alertRes] = await Promise.all([
    supabase
      .from("discovery_sources")
      .select(
        "id, code, name, feed_url, crawl_method, layer, stream_id, status, exclusivity_window_hours, signal_only_eligible, monitored_since, paused_until",
      )
      .order("name", { ascending: true }),
    supabase.from("discovery_streams").select("id, name"),
    supabase
      .from("sweep_site_results")
      .select("source_id, outcome, candidate_count, failure_streak, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("ops_rr_alerts").select("source_id, status, issue_type"),
  ]);

  const sources: SourceRow[] = srcRes.data ?? [];
  const streams: StreamRow[] = streamRes.data ?? [];
  const recent: SiteResult[] = recentRes.data ?? [];
  const alerts: Alert[] = alertRes.data ?? [];

  const streamMap = new Map(streams.map((s) => [s.id, s]));

  // Aggregate per source from recent sweep results
  type SrcStats = {
    runs: number;
    success: number;
    cands: number;
    lastSeen: string | null;
    lastStreak: number;
  };
  const statsBySource: Record<string, SrcStats> = {};
  for (const r of recent) {
    const s = (statsBySource[r.source_id] ??= {
      runs: 0,
      success: 0,
      cands: 0,
      lastSeen: null,
      lastStreak: 0,
    });
    s.runs++;
    if (r.outcome === "reached_items" || r.outcome === "reached_empty") s.success++;
    s.cands += r.candidate_count;
    if (!s.lastSeen || new Date(r.created_at) > new Date(s.lastSeen)) {
      s.lastSeen = r.created_at;
      s.lastStreak = r.failure_streak;
    }
  }
  const alertsBySource = new Map<string, number>();
  for (const a of alerts) {
    if (!a.source_id) continue;
    if (a.status === "resolved") continue;
    alertsBySource.set(a.source_id, (alertsBySource.get(a.source_id) ?? 0) + 1);
  }

  // Counts
  const statusCounts = {
    all: sources.length,
    active: sources.filter((s) => s.status === "active").length,
    warning: sources.filter((s) => s.status === "warning").length,
    critical: sources.filter((s) => s.status === "critical").length,
    paused: sources.filter((s) => s.status === "paused").length,
  };
  const layerCounts = {
    all: sources.length,
    l1: sources.filter((s) => s.layer === "l1").length,
    l2: sources.filter((s) => s.layer === "l2").length,
    l3: sources.filter((s) => s.layer === "l3").length,
    l4: sources.filter((s) => s.layer === "l4").length,
  };

  let visible = sources;
  if (status !== "all") visible = visible.filter((s) => s.status === status);
  if (layer !== "all") visible = visible.filter((s) => s.layer === layer);

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Status
        </span>
        <div className="flex items-center gap-1">
          <Chip
            label="All"
            count={statusCounts.all}
            active={status === "all"}
            href={layer === "all" ? "/system/source-health" : `/system/source-health?layer=${layer}`}
          />
          {(["active", "warning", "critical", "paused"] as const).map((k) => (
            <Chip
              key={k}
              label={STATUS_LABEL[k]}
              count={statusCounts[k]}
              active={status === k}
              tone={k === "warning" ? "warn" : k === "critical" ? "danger" : undefined}
              href={`/system/source-health?status=${k}${layer !== "all" ? `&layer=${layer}` : ""}`}
            />
          ))}
        </div>

        <span className="mx-1 h-5 w-px bg-border" />

        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Layer
        </span>
        <div className="flex items-center gap-1">
          <Chip
            label="All"
            count={layerCounts.all}
            active={layer === "all"}
            href={status === "all" ? "/system/source-health" : `/system/source-health?status=${status}`}
          />
          {(["l1", "l2", "l3", "l4"] as const).map((k) => (
            <Chip
              key={k}
              label={k.toUpperCase()}
              count={layerCounts[k]}
              active={layer === k}
              mono
              href={`/system/source-health?layer=${k}${status !== "all" ? `&status=${status}` : ""}`}
            />
          ))}
        </div>

        <span className="ml-auto text-[11px] text-um-muted">
          {visible.length} of {sources.length} sources
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-6 py-16 text-center text-[12.5px] text-um-muted">
            No sources match these filters.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Status</Th>
                <Th>Source</Th>
                <Th>Code</Th>
                <Th>Layer</Th>
                <Th>Stream</Th>
                <Th>Method</Th>
                <Th className="text-right">Success</Th>
                <Th className="text-right">Cands/run</Th>
                <Th className="text-right">Streak</Th>
                <Th>Last seen</Th>
                <Th>Open OPS-RR</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const st = statsBySource[s.id];
                const successRate = st && st.runs > 0 ? (st.success / st.runs) * 100 : null;
                const avgCands = st && st.runs > 0 ? st.cands / st.runs : null;
                const stream = s.stream_id ? streamMap.get(s.stream_id) : null;
                const openAlerts = alertsBySource.get(s.id) ?? 0;
                return (
                  <tr
                    key={s.id}
                    className="border-b border-border transition-colors hover:bg-secondary"
                  >
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={cn("h-2 w-2 rounded-full", STATUS_DOT[s.status])}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                            STATUS_PILL[s.status],
                          )}
                        >
                          {STATUS_LABEL[s.status]}
                        </span>
                      </span>
                    </td>
                    <td className="max-w-[320px] px-3 py-2.5">
                      <span className="block truncate text-[12.5px] font-medium text-foreground">
                        {s.name}
                      </span>
                      <span className="block truncate font-mono text-[10.5px] text-um-muted">
                        {s.feed_url}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] tabular-nums text-fg-2">
                      {s.code}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-sm border border-border-mid bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-2">
                        {s.layer}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-fg-2">
                      {stream?.name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] uppercase tracking-wider text-um-muted">
                      {s.crawl_method ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11.5px] tabular-nums",
                        successRate === null
                          ? "text-um-muted"
                          : successRate >= 90
                            ? "text-success"
                            : successRate >= 70
                              ? "text-warn"
                              : "text-destructive",
                      )}
                    >
                      {successRate === null ? "—" : `${successRate.toFixed(0)}%`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11.5px] tabular-nums text-fg-2">
                      {avgCands === null ? "—" : avgCands.toFixed(1)}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11.5px] tabular-nums",
                        !st
                          ? "text-um-muted"
                          : st.lastStreak >= 3
                            ? "text-destructive"
                            : st.lastStreak > 0
                              ? "text-warn"
                              : "text-um-muted",
                      )}
                    >
                      {st ? st.lastStreak : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-um-muted">
                      {relTime(st?.lastSeen ?? null)}
                    </td>
                    <td className="px-3 py-2.5">
                      {openAlerts > 0 ? (
                        <Link
                          href="/discovery/ops-rr"
                          className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[10.5px] font-medium text-warn hover:underline"
                        >
                          {openAlerts} open
                        </Link>
                      ) : (
                        <span className="text-[10.5px] text-um-muted">—</span>
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
  );
}

function Chip({
  label,
  count,
  active,
  href,
  tone,
  mono,
}: {
  label: string;
  count: number;
  active: boolean;
  href: string;
  tone?: "warn" | "danger";
  mono?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border bg-background text-fg-2 hover:border-border-mid hover:text-foreground",
        mono && "font-mono uppercase tracking-wider",
      )}
    >
      {label}
      <span
        className={cn(
          "font-mono text-[10px] tabular-nums",
          active
            ? "text-primary"
            : tone === "danger"
              ? "text-destructive"
              : tone === "warn"
                ? "text-warn"
                : "text-um-muted",
        )}
      >
        {count}
      </span>
    </Link>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 border-b border-border bg-card px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.045em] text-um-muted",
        className,
      )}
    >
      {children}
    </th>
  );
}
