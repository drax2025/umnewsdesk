import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  acknowledgeAlert,
  deferAlert,
  escalateAlert,
  reopenAlert,
  resolveAlert,
} from "@/lib/actions/ops-rr";

export const dynamic = "force-dynamic";

type AlertRow = {
  id: string;
  code: string;
  source_id: string | null;
  sweep_run_id: string | null;
  severity: "p1" | "p2" | "p3";
  issue_type: string;
  status: "open" | "investigating" | "deferred" | "resolved" | "escalated";
  description: string;
  owner_id: string | null;
  sla_deadline_at: string | null;
  auto_raised: boolean;
  escalation_code: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type SourceRow = {
  id: string;
  name: string;
  code: string;
  layer: "l1" | "l2" | "l3" | "l4";
  feed_url: string;
};

type SweepRow = { id: string; code: string; slot: "am" | "pm"; started_at: string };

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "deferred", label: "Deferred" },
  { value: "resolved", label: "Resolved" },
  { value: "escalated", label: "Escalated" },
];

const ISSUE_LABEL: Record<string, string> = {
  parse_failure: "Parse failure",
  unreachable: "Unreachable",
  rate_limit: "Rate limit",
  schema_drift: "Schema drift",
  volume_anomaly: "Volume anomaly",
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

const SEV_CHIP: Record<string, string> = {
  p1: "bg-destructive/15 text-destructive",
  p2: "bg-warn/15 text-warn",
  p3: "bg-um-muted/15 text-um-muted",
};

const STATUS_DOT: Record<string, string> = {
  open: "bg-destructive",
  investigating: "bg-warn",
  deferred: "bg-um-muted",
  resolved: "bg-success",
  escalated: "bg-destructive",
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · ${d
    .toLocaleTimeString("en-GB", { hour12: false })
    .slice(0, 5)}`;
}

export default async function OpsRrQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; id?: string; severity?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const sev = sp.severity ?? "";
  const q = sp.q ?? "";

  const supabase = await createClient();
  const [alertsRes, sourcesRes, sweepsRes] = await Promise.all([
    supabase
      .from("ops_rr_alerts")
      .select(
        "id, code, source_id, sweep_run_id, severity, issue_type, status, description, owner_id, sla_deadline_at, auto_raised, escalation_code, created_at, updated_at, resolved_at",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("discovery_sources").select("id, name, code, layer, feed_url"),
    supabase.from("sweep_runs").select("id, code, slot, started_at").order("started_at", {
      ascending: false,
    }),
  ]);

  const alerts: AlertRow[] = alertsRes.data ?? [];
  const sources: SourceRow[] = sourcesRes.data ?? [];
  const sweeps: SweepRow[] = sweepsRes.data ?? [];

  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  const sweepMap = new Map(sweeps.map((s) => [s.id, s]));

  const tabCounts = new Map<string, number>();
  for (const t of STATUS_TABS) tabCounts.set(t.value, 0);
  for (const a of alerts) tabCounts.set(a.status, (tabCounts.get(a.status) ?? 0) + 1);

  let filtered = alerts.filter((a) => a.status === status);
  if (sev) filtered = filtered.filter((a) => a.severity === sev);
  if (q) {
    const qq = q.toLowerCase();
    filtered = filtered.filter(
      (a) => a.code.toLowerCase().includes(qq) || a.description.toLowerCase().includes(qq),
    );
  }

  // Auto-redirect to first item if no id
  const activeId = sp.id;
  if (!activeId && filtered.length > 0) {
    const next = new URLSearchParams();
    next.set("status", status);
    if (sev) next.set("severity", sev);
    if (q) next.set("q", q);
    next.set("id", filtered[0].id);
    redirect(`/discovery/ops-rr?${next.toString()}`);
  }

  const active = filtered.find((a) => a.id === activeId) ?? null;
  const activeSource = active?.source_id ? sourceMap.get(active.source_id) : null;
  const activeSweep = active?.sweep_run_id ? sweepMap.get(active.sweep_run_id) : null;

  const slaAtRisk = filtered.filter((a) => {
    const r = slaRemaining(a.sla_deadline_at);
    return r.tone === "warn" || r.tone === "danger";
  }).length;

  // Related items for active alert (same source)
  const related = active
    ? alerts
        .filter(
          (a) =>
            a.id !== active.id &&
            a.source_id === active.source_id &&
            a.source_id !== null,
        )
        .slice(0, 5)
    : [];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Queue list */}
      <div className="flex w-[360px] flex-shrink-0 flex-col border-r border-border bg-card">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-[13px] font-semibold text-foreground">OPS-RR Queue</span>
          {slaAtRisk > 0 ? (
            <span className="font-mono text-[10.5px] text-warn">
              {slaAtRisk} SLA at risk
            </span>
          ) : null}
        </div>

        {/* Tabs */}
        <div className="flex flex-shrink-0 items-end gap-0 overflow-x-auto border-b border-border">
          {STATUS_TABS.map((t) => {
            const isActive = t.value === status;
            const c = tabCounts.get(t.value) ?? 0;
            const next = new URLSearchParams();
            next.set("status", t.value);
            if (sev) next.set("severity", sev);
            if (q) next.set("q", q);
            return (
              <Link
                key={t.value}
                href={`/discovery/ops-rr?${next.toString()}`}
                className={cn(
                  "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[11.5px] font-medium transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-fg-2 hover:text-foreground",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "rounded-full border px-1.5 font-mono text-[9.5px] tabular-nums leading-[1.7]",
                    isActive
                      ? "border-primary/35 bg-accent text-primary"
                      : t.value === "open" && c > 0
                        ? "border-warn/40 bg-warn/10 text-warn"
                        : "border-border bg-background text-um-muted",
                  )}
                >
                  {c}
                </span>
              </Link>
            );
          })}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-12 text-center text-[12px] text-um-muted">
              No alerts in this view.
            </div>
          ) : (
            <ul>
              {filtered.map((a) => {
                const src = a.source_id ? sourceMap.get(a.source_id) : null;
                const sla = slaRemaining(a.sla_deadline_at);
                const isActive = a.id === activeId;
                const next = new URLSearchParams();
                next.set("status", status);
                if (sev) next.set("severity", sev);
                if (q) next.set("q", q);
                next.set("id", a.id);
                return (
                  <li key={a.id} className="border-b border-border last:border-b-0">
                    <Link
                      href={`/discovery/ops-rr?${next.toString()}`}
                      className={cn(
                        "block px-4 py-3 transition-colors hover:bg-secondary",
                        isActive && "bg-secondary",
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                          {a.code}
                        </span>
                        <span
                          className={cn(
                            "rounded-sm px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                            SEV_CHIP[a.severity],
                          )}
                        >
                          {a.severity}
                        </span>
                        <span
                          className={cn(
                            "ml-auto rounded-full border px-1.5 py-0.5 text-[9.5px] font-medium",
                            ISSUE_CHIP[a.issue_type] ?? "border-border text-um-muted",
                          )}
                        >
                          {ISSUE_LABEL[a.issue_type] ?? a.issue_type}
                        </span>
                      </div>
                      <div className="mb-1 line-clamp-2 text-[12px] leading-[1.35] text-fg-2">
                        {a.description}
                      </div>
                      <div className="flex items-center gap-2 text-[10.5px] text-um-muted">
                        <span className="truncate">{src?.name ?? "—"}</span>
                        <span className="ml-auto font-mono tabular-nums">
                          {relTime(a.created_at)}
                        </span>
                        {sla.tone !== "none" ? (
                          <span
                            className={cn(
                              "font-mono tabular-nums",
                              sla.tone === "danger" && "text-destructive",
                              sla.tone === "warn" && "text-warn",
                              sla.tone === "ok" && "text-um-muted",
                            )}
                          >
                            SLA {sla.label}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {active ? (
          <>
            {/* Detail header */}
            <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
              <div className="flex items-start gap-4">
                <span className="flex-shrink-0 font-mono text-[12px] font-semibold tabular-nums text-foreground">
                  {active.code}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[12.5px] font-semibold text-foreground">
                      {activeSource?.name ?? "Unknown source"}
                    </span>
                    {activeSource ? (
                      <span className="rounded-sm border border-border-mid bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-2">
                        {activeSource.layer}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[12.5px] leading-[1.5] text-fg-2">{active.description}</p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                  <span
                    className={cn(
                      "rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      SEV_CHIP[active.severity],
                    )}
                  >
                    {active.severity}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                      ISSUE_CHIP[active.issue_type],
                    )}
                  >
                    {ISSUE_LABEL[active.issue_type] ?? active.issue_type}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11.5px]">
                <Meta label="Opened" val={fmtDateTime(active.created_at)} />
                <Meta label="Age" val={relTime(active.created_at)} tone="warn" />
                <SlaMeta deadline={active.sla_deadline_at} />
                <Meta
                  label="Owner"
                  val={active.owner_id ? "Assigned" : "Unassigned"}
                  tone={active.owner_id ? undefined : "warn"}
                />
                {activeSweep ? (
                  <Meta
                    label="Triggering run"
                    val={`${activeSweep.code} ${activeSweep.slot.toUpperCase()}`}
                    href="/discovery/sweeps"
                  />
                ) : null}
                {activeSource ? (
                  <Meta label="Layer" val={activeSource.layer.toUpperCase()} mono />
                ) : null}
              </div>
            </div>

            {/* SLA banner */}
            {(() => {
              const sla = slaRemaining(active.sla_deadline_at);
              if (sla.tone !== "danger" && sla.tone !== "warn") return null;
              return (
                <div
                  className={cn(
                    "flex flex-shrink-0 items-center gap-3 border-b px-6 py-2 text-[11.5px]",
                    sla.tone === "danger"
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "border-warn/30 bg-warn/10 text-warn",
                  )}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="flex-1 font-medium">
                    {sla.tone === "danger"
                      ? "SLA breach imminent — alert must be acknowledged."
                      : `SLA at risk — acknowledge before deadline.`}
                  </span>
                  <span className="font-mono tabular-nums">{sla.label}</span>
                </div>
              );
            })()}

            {/* Body */}
            <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-6 xl:grid-cols-2">
              <div className="flex flex-col gap-4">
                <Card title="Issue detail">
                  <Row k="Description" v={active.description} />
                  <Row
                    k="Alert type"
                    v={
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                          ISSUE_CHIP[active.issue_type],
                        )}
                      >
                        {ISSUE_LABEL[active.issue_type] ?? active.issue_type}
                      </span>
                    }
                  />
                  <Row
                    k="Affected source"
                    v={
                      activeSource ? (
                        <>
                          <span className="text-foreground">{activeSource.name}</span> ·{" "}
                          <span className="text-um-muted">
                            {activeSource.layer.toUpperCase()} · {activeSource.code}
                          </span>
                        </>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <Row k="First seen" v={fmtDateTime(active.created_at)} />
                  <Row
                    k="Auto-raised"
                    v={active.auto_raised ? "Yes (system)" : "No (manual)"}
                  />
                  {active.escalation_code ? (
                    <Row
                      k="Escalation"
                      v={<span className="text-destructive">{active.escalation_code}</span>}
                    />
                  ) : null}
                </Card>

                <Card title="Linked sweep runs" link={{ label: "View run →", href: "/discovery/sweeps" }}>
                  {activeSweep ? (
                    <div className="flex items-center gap-3 border-b border-border py-2 text-[11.5px] last:border-b-0">
                      <Link
                        href="/discovery/sweeps"
                        className="font-mono font-semibold tabular-nums text-primary hover:underline"
                      >
                        {activeSweep.code}
                      </Link>
                      <span className="flex-1 text-fg-2">
                        {activeSweep.slot.toUpperCase()} sweep ·{" "}
                        {new Date(activeSweep.started_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </div>
                  ) : (
                    <p className="py-2 text-[11.5px] italic text-um-muted">
                      No triggering sweep run linked.
                    </p>
                  )}
                </Card>

                {activeSource ? (
                  <Card
                    title="Source snapshot"
                    link={{ label: "Full monitor →", href: "/system/source-health" }}
                  >
                    <Row k="Feed URL" v={activeSource.feed_url} mono />
                    <Row k="Layer" v={activeSource.layer.toUpperCase()} mono />
                    <Row k="Code" v={activeSource.code} mono />
                  </Card>
                ) : null}
              </div>

              <div className="flex flex-col gap-4">
                <Card title="Current status">
                  <Row
                    k="Status"
                    v={
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[active.status])}
                        />
                        <span className="capitalize text-foreground">{active.status}</span>
                      </span>
                    }
                  />
                  <Row
                    k="Severity"
                    v={
                      <span
                        className={cn(
                          "rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                          SEV_CHIP[active.severity],
                        )}
                      >
                        {active.severity}
                      </span>
                    }
                  />
                  <Row
                    k="Assigned to"
                    v={
                      active.owner_id ? (
                        <span className="text-fg-2">Owner ID {active.owner_id.slice(0, 8)}</span>
                      ) : (
                        <span className="text-warn">Unassigned</span>
                      )
                    }
                  />
                  <Row k="SLA deadline" v={fmtDateTime(active.sla_deadline_at)} />
                  <Row k="Last updated" v={fmtDateTime(active.updated_at)} />
                  {active.resolved_at ? (
                    <Row k="Resolved at" v={fmtDateTime(active.resolved_at)} />
                  ) : null}
                </Card>

                <Card title="Event timeline">
                  <Tl
                    tone="err"
                    ts={fmtDateTime(active.created_at).split(" · ")[1]}
                    badge="System"
                    text={`Alert ${active.code} opened${active.auto_raised ? " automatically" : ""}.`}
                  />
                  {active.sla_deadline_at ? (
                    <Tl
                      tone="warn"
                      ts={fmtDateTime(active.created_at).split(" · ")[1]}
                      badge="System"
                      text={`SLA timer started — deadline ${fmtDateTime(active.sla_deadline_at)}.`}
                    />
                  ) : null}
                  {active.updated_at !== active.created_at ? (
                    <Tl
                      tone="ok"
                      ts={fmtDateTime(active.updated_at).split(" · ")[1]}
                      badge="System"
                      text={`Status: ${active.status}.`}
                    />
                  ) : null}
                  {active.resolved_at ? (
                    <Tl
                      tone="success"
                      ts={fmtDateTime(active.resolved_at).split(" · ")[1]}
                      badge="System"
                      text="Alert resolved and closed."
                    />
                  ) : null}
                </Card>

                <Card title="Related OPS-RR" badge={related.length.toString()}>
                  {related.length === 0 ? (
                    <p className="py-2 text-[11.5px] italic text-um-muted">
                      No other alerts on this source.
                    </p>
                  ) : (
                    related.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 border-b border-border py-2 text-[11.5px] last:border-b-0"
                      >
                        <Link
                          href={`/discovery/ops-rr?status=${r.status}&id=${r.id}`}
                          className="font-mono font-semibold tabular-nums text-primary hover:underline"
                        >
                          {r.code}
                        </Link>
                        <span className="flex-1 truncate text-fg-2">
                          {ISSUE_LABEL[r.issue_type] ?? r.issue_type} · {r.severity.toUpperCase()}
                        </span>
                        <span
                          className={cn(
                            "text-[10.5px] capitalize",
                            r.status === "resolved" ? "text-success" : "text-um-muted",
                          )}
                        >
                          {r.status}
                        </span>
                      </div>
                    ))
                  )}
                </Card>
              </div>
            </div>

            {/* Action tray */}
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-border bg-card px-6 py-3">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
                Actions
              </span>
              <span className="text-[11px] capitalize text-fg-2">
                Current: <span className="font-medium text-foreground">{active.status}</span>
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                {active.status === "open" || active.status === "deferred" ? (
                  <ActionButton
                    action={acknowledgeAlert}
                    id={active.id}
                    label="Acknowledge"
                    className="border-state-comm/40 bg-state-comm/10 text-state-comm hover:bg-state-comm/15"
                  />
                ) : null}
                {active.status === "open" || active.status === "investigating" ? (
                  <ActionButton
                    action={deferAlert}
                    id={active.id}
                    label="Defer"
                    className="border-border bg-background text-fg-2 hover:bg-secondary"
                  />
                ) : null}
                {active.status !== "resolved" ? (
                  <ActionButton
                    action={escalateAlert}
                    id={active.id}
                    label="Escalate"
                    className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
                  />
                ) : null}
                {active.status !== "resolved" ? (
                  <ActionButton
                    action={resolveAlert}
                    id={active.id}
                    label="Resolve"
                    className="border-success/40 bg-success/10 text-success hover:bg-success/15"
                  />
                ) : (
                  <ActionButton
                    action={reopenAlert}
                    id={active.id}
                    label="Reopen"
                    className="border-warn/40 bg-warn/10 text-warn hover:bg-warn/15"
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[12.5px] text-um-muted">
            Select an alert to view detail.
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({
  label,
  val,
  tone,
  mono,
  href,
}: {
  label: string;
  val: string;
  tone?: "warn" | "danger";
  mono?: boolean;
  href?: string;
}) {
  const valClass = cn(
    "font-medium",
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-warn" : "text-fg-2",
    mono && "font-mono text-[11px] uppercase tracking-wider",
  );
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-um-muted">{label}</span>
      {href ? (
        <Link href={href} className={cn(valClass, "text-primary hover:underline")}>
          {val}
        </Link>
      ) : (
        <span className={valClass}>{val}</span>
      )}
    </div>
  );
}

function SlaMeta({ deadline }: { deadline: string | null }) {
  const sla = slaRemaining(deadline);
  if (sla.tone === "none") return null;
  return (
    <Meta
      label="SLA"
      val={sla.label}
      tone={sla.tone === "danger" ? "danger" : sla.tone === "warn" ? "warn" : undefined}
    />
  );
}

function Card({
  title,
  link,
  badge,
  children,
}: {
  title: string;
  link?: { label: string; href: string };
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-3 py-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
          {title}
        </span>
        {badge ? (
          <span className="rounded-full border border-border bg-background px-1.5 font-mono text-[9.5px] tabular-nums text-um-muted">
            {badge}
          </span>
        ) : null}
        {link ? (
          <Link href={link.href} className="text-[10.5px] font-medium text-primary hover:underline">
            {link.label}
          </Link>
        ) : null}
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

function Row({
  k,
  v,
  mono,
}: {
  k: string;
  v: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border py-2 text-[11.5px] last:border-b-0">
      <span className="w-28 flex-shrink-0 pt-0.5 text-um-muted">{k}</span>
      <span className={cn("flex-1 leading-[1.5] text-fg-2", mono && "font-mono text-[11px]")}>
        {v}
      </span>
    </div>
  );
}

function Tl({
  tone,
  ts,
  badge,
  text,
}: {
  tone: "err" | "warn" | "ok" | "success";
  ts: string;
  badge: string;
  text: string;
}) {
  const dot =
    tone === "err"
      ? "bg-destructive"
      : tone === "warn"
        ? "bg-warn"
        : tone === "success"
          ? "bg-success"
          : "bg-um-muted";
  return (
    <div className="flex items-start gap-3 border-b border-border py-2 text-[11.5px] last:border-b-0">
      <span className={cn("mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full", dot)} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="font-mono text-[10.5px] tabular-nums text-um-muted">{ts}</span>
          <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wider text-fg-2">
            {badge}
          </span>
        </div>
        <p className="leading-[1.45] text-fg-2">{text}</p>
      </div>
    </div>
  );
}

function ActionButton({
  action,
  id,
  label,
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  className: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className={cn(
          "h-7 rounded-sm border px-3 text-[11.5px] font-medium transition-colors",
          className,
        )}
      >
        {label}
      </button>
    </form>
  );
}

function slaRemaining(deadline: string | null): { label: string; tone: "danger" | "warn" | "ok" | "none" } {
  if (!deadline) return { label: "—", tone: "none" };
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms < 0) return { label: "Breached", tone: "danger" };
  const m = Math.floor(ms / 60_000);
  if (m < 60) return { label: `${m}m`, tone: "danger" };
  const h = Math.floor(m / 60);
  if (h < 4) return { label: `${h}h ${m % 60}m`, tone: "warn" };
  return { label: `${h}h`, tone: "ok" };
}
