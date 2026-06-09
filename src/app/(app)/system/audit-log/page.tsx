import Link from "next/link";
import { ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SweepRow = {
  id: string;
  code: string;
  slot: "am" | "pm";
  status: string;
  started_at: string;
  completed_at: string | null;
  candidates_total: number;
  parse_failures: number;
  not_reached: number;
};

type AlertRow = {
  id: string;
  code: string;
  status: string;
  issue_type: string;
  severity: string;
  description: string;
  created_at: string;
  resolved_at: string | null;
};

const SLOT_PILL: Record<string, string> = {
  am: "bg-state-legal/15 text-state-legal",
  pm: "bg-state-sub/15 text-state-sub",
};

const STATUS_PILL: Record<string, string> = {
  complete: "border-success/30 bg-success/10 text-success",
  running: "border-state-comm/30 bg-state-comm/10 text-state-comm",
  partial: "border-warn/30 bg-warn/10 text-warn",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · ${d
    .toLocaleTimeString("en-GB", { hour12: false })
    .slice(0, 5)}`;
}

export default async function DiscoveryAuditLogPage() {
  const supabase = await createClient();

  const [sweepRes, alertRes] = await Promise.all([
    supabase
      .from("sweep_runs")
      .select(
        "id, code, slot, status, started_at, completed_at, candidates_total, parse_failures, not_reached",
      )
      .order("started_at", { ascending: false })
      .limit(50),
    supabase
      .from("ops_rr_alerts")
      .select(
        "id, code, status, issue_type, severity, description, created_at, resolved_at",
      )
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const sweeps: SweepRow[] = sweepRes.data ?? [];
  const alerts: AlertRow[] = alertRes.data ?? [];

  // Merge events
  type Event =
    | { kind: "sweep_started"; at: string; row: SweepRow }
    | { kind: "sweep_completed"; at: string; row: SweepRow }
    | { kind: "alert_opened"; at: string; row: AlertRow }
    | { kind: "alert_resolved"; at: string; row: AlertRow };

  const events: Event[] = [];
  for (const s of sweeps) {
    events.push({ kind: "sweep_started", at: s.started_at, row: s });
    if (s.completed_at) events.push({ kind: "sweep_completed", at: s.completed_at, row: s });
  }
  for (const a of alerts) {
    events.push({ kind: "alert_opened", at: a.created_at, row: a });
    if (a.resolved_at) events.push({ kind: "alert_resolved", at: a.resolved_at, row: a });
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
        <ScrollText className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold text-foreground">Discovery Audit Log</span>
        <span className="text-[11px] text-um-muted">
          {events.length} event{events.length === 1 ? "" : "s"} · last 50 sweeps and alerts
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="rounded-md border border-border bg-card">
          {events.length === 0 ? (
            <div className="px-4 py-12 text-center text-[12.5px] text-um-muted">
              No discovery events recorded.
            </div>
          ) : (
            <ul>
              {events.map((e, i) => (
                <li
                  key={`${e.kind}-${e.row.id}-${i}`}
                  className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 flex-shrink-0 rounded-full",
                      e.kind === "alert_opened" && "bg-destructive",
                      e.kind === "alert_resolved" && "bg-success",
                      e.kind === "sweep_started" && "bg-state-comm",
                      e.kind === "sweep_completed" && "bg-state-sched",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    {e.kind === "sweep_started" || e.kind === "sweep_completed" ? (
                      <SweepEventRow
                        kind={e.kind}
                        row={e.row as SweepRow}
                      />
                    ) : (
                      <AlertEventRow
                        kind={e.kind}
                        row={e.row as AlertRow}
                      />
                    )}
                  </div>
                  <span className="flex-shrink-0 font-mono text-[10.5px] tabular-nums text-um-muted">
                    {fmt(e.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SweepEventRow({ kind, row }: { kind: "sweep_started" | "sweep_completed"; row: SweepRow }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
          SLOT_PILL[row.slot],
        )}
      >
        {row.slot}
      </span>
      <Link
        href={`/discovery/sweeps?id=${row.id}`}
        className="font-mono text-[11.5px] font-semibold tabular-nums text-primary hover:underline"
      >
        {row.code}
      </Link>
      <span className="text-fg-2">
        {kind === "sweep_started" ? "started" : "completed"}
      </span>
      {kind === "sweep_completed" ? (
        <>
          <span
            className={cn(
              "rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize",
              STATUS_PILL[row.status],
            )}
          >
            {row.status}
          </span>
          <span className="text-[11px] text-um-muted">
            · {row.candidates_total} cands · {row.parse_failures + row.not_reached} issues
          </span>
        </>
      ) : null}
    </div>
  );
}

function AlertEventRow({
  kind,
  row,
}: {
  kind: "alert_opened" | "alert_resolved";
  row: AlertRow;
}) {
  return (
    <div className="flex flex-col gap-1 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
            row.severity === "p1"
              ? "bg-destructive/15 text-destructive"
              : row.severity === "p2"
                ? "bg-warn/15 text-warn"
                : "bg-um-muted/15 text-um-muted",
          )}
        >
          {row.severity}
        </span>
        <Link
          href={`/discovery/ops-rr?status=${row.status}&id=${row.id}`}
          className="font-mono text-[11.5px] font-semibold tabular-nums text-primary hover:underline"
        >
          {row.code}
        </Link>
        <span className={cn(kind === "alert_opened" ? "text-destructive" : "text-success")}>
          {kind === "alert_opened" ? "opened" : "resolved"}
        </span>
        <span className="text-[11px] capitalize text-um-muted">
          · {row.issue_type.replace("_", " ")}
        </span>
      </div>
      <p className="line-clamp-2 text-[11.5px] leading-[1.4] text-fg-2">{row.description}</p>
    </div>
  );
}
