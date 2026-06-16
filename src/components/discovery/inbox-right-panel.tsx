"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, SidebarOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible right-hand panel for the Candidate Inbox.
 *
 * Same model as DiscoveryRightPanel: client component owns collapse
 * state, persists it under a route-specific localStorage key so the
 * inbox and overview panels stay independent.
 *
 * Time-sensitive labels (relTime for "oldest in queue") are
 * pre-formatted server-side and passed as strings — keeps SSR and
 * the first client paint identical, and means this component does
 * no Date math of its own.
 */

const STORAGE_KEY = "umd:discovery-inbox-rpanel:collapsed";

export type InboxOpsAlert = {
  code: string;
  description: string;
};

export type InboxRightPanelProps = {
  readyCount: number;
  heldDup: number;
  heldSource: number;
  pointer: number;
  needsReview: number;
  /** Pre-formatted relTime label; null when there's no candidate in 'ready'. */
  oldestReadyLabel: string | null;
  acceptanceRate: number;
  dedupRate: number;
  /** Pre-formatted "12.5/22" or "—" when no scored ready candidates. */
  avgScoreLabel: string;
  lastSweepCode: string | null;
  openOps: InboxOpsAlert[];
};

export function InboxRightPanel({
  readyCount,
  heldDup,
  heldSource,
  pointer,
  needsReview,
  oldestReadyLabel,
  acceptanceRate,
  dedupRate,
  avgScoreLabel,
  lastSweepCode,
  openOps,
}: InboxRightPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      // private mode / disabled storage — stay expanded.
    }
    setHydrated(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore — we still update visually, just don't persist.
      }
      return next;
    });
  }

  // Combined "needs human attention" count for the collapsed strip.
  const holds = heldDup + heldSource + needsReview;

  if (collapsed) {
    return (
      <aside
        className={cn(
          "hidden w-[36px] flex-shrink-0 flex-col items-center border-l border-border bg-card lg:flex",
          !hydrated && "opacity-0",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          title="Expand panel"
          className="flex h-9 w-full items-center justify-center border-b border-border text-um-muted hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={toggle}
          title="Expand panel"
          className="flex flex-1 items-center justify-center py-3 text-um-muted hover:text-foreground"
        >
          <span
            className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] [writing-mode:vertical-rl]"
            style={{ transform: "rotate(180deg)" }}
          >
            Route summary · OPS-RR
          </span>
        </button>
        <div className="flex w-full flex-col items-center gap-1.5 border-t border-border py-2 text-[9.5px]">
          <span className="font-mono tabular-nums text-success" title="Ready for F1">
            {readyCount}
          </span>
          <span className="font-mono tabular-nums text-warn" title="Held + needs review">
            {holds}
          </span>
          <span
            className="font-mono tabular-nums text-destructive"
            title="Open OPS-RR alerts"
          >
            {openOps.length}
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden w-[300px] flex-shrink-0 flex-col overflow-y-auto border-l border-border bg-card lg:flex">
      {/* Header strip with collapse toggle, mirrors discovery overview. */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-background/40 px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-um-muted">
          <SidebarOpen className="h-3 w-3" />
          Side panel
        </span>
        <button
          type="button"
          onClick={toggle}
          title="Collapse panel"
          className="flex h-6 w-6 items-center justify-center rounded-sm border border-border bg-background text-um-muted hover:bg-secondary hover:text-foreground"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
          Route Summary
        </span>
      </div>

      <div className="space-y-2 px-4 py-3">
        <RouteCard
          value={readyCount}
          tone="success"
          label="Ready for F1 Triage"
          sub={
            oldestReadyLabel
              ? `Passed verification + dedup check. Oldest: ${oldestReadyLabel}.`
              : "Passed verification + dedup check."
          }
          href="/discovery/inbox?state=ready"
        />
        <RouteCard
          value={heldDup}
          tone="warn"
          label="Held — Duplicate"
          sub="Similar story already in pipeline (within 72h window)."
          href="/discovery/inbox?state=held_dedup"
        />
        <RouteCard
          value={heldSource}
          tone="hold"
          label="Held — Source Issue"
          sub="Primary URL unverified or source flagged with active OPS-RR."
          href="/discovery/inbox?state=held_source"
        />
        <RouteCard
          value={pointer}
          tone="muted"
          label="Parked — Pointer Only"
          sub="No primary content. Signal logged for reference."
          href="/discovery/inbox?state=pointer"
        />
        <RouteCard
          value={needsReview}
          tone="danger"
          label="Needs Review"
          sub="Flagged by operator or schema mismatch — requires manual check."
          href="/discovery/inbox?state=needs_review"
        />
      </div>

      <div className="border-t border-border px-4 py-3">
        <StatRow k="Acceptance rate" v={`${acceptanceRate.toFixed(1)}%`} tone="success" />
        <StatRow k="Dedup hold rate" v={`${dedupRate.toFixed(1)}%`} tone="warn" />
        <StatRow
          k="Oldest in queue"
          v={oldestReadyLabel ?? "—"}
          tone={oldestReadyLabel ? "warn" : undefined}
        />
        <StatRow k="Avg score (ready)" v={avgScoreLabel} />
        <StatRow
          k="Last sweep"
          v={
            lastSweepCode ? (
              <Link href="/discovery/sweeps" className="text-primary hover:underline">
                {lastSweepCode}
              </Link>
            ) : (
              "—"
            )
          }
        />
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
            Open OPS-RR
          </span>
          <span className="font-mono text-[10px] text-warn">{openOps.length} open</span>
        </div>
        {openOps.length === 0 ? (
          <p className="text-[11px] italic text-um-muted">No open issues.</p>
        ) : (
          <ul className="space-y-2">
            {openOps.map((o) => (
              <li key={o.code} className="flex items-start gap-2">
                <span className="flex-shrink-0 pt-0.5 font-mono text-[10px] font-semibold text-warn">
                  {o.code}
                </span>
                <span className="text-[11px] leading-[1.4] text-fg-2">{o.description}</span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/discovery/ops-rr"
          className="mt-3 block text-[11px] font-medium text-primary hover:underline"
        >
          View full OPS-RR queue →
        </Link>
      </div>
    </aside>
  );
}

function RouteCard({
  value,
  tone,
  label,
  sub,
  href,
}: {
  value: number;
  tone: "success" | "warn" | "hold" | "muted" | "danger";
  label: string;
  sub: string;
  href: string;
}) {
  const valClass =
    tone === "success"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-destructive"
          : tone === "hold"
            ? "text-state-legal"
            : "text-um-muted";
  return (
    <Link
      href={href}
      className="block rounded-md border border-border bg-background p-3 transition-colors hover:border-border-mid"
    >
      <div className="mb-1 flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-[20px] font-semibold leading-none tabular-nums",
            valClass,
          )}
        >
          {value}
        </span>
      </div>
      <div className="text-[11.5px] font-medium text-foreground">{label}</div>
      <div className="mt-0.5 text-[10.5px] leading-[1.4] text-um-muted">{sub}</div>
    </Link>
  );
}

function StatRow({
  k,
  v,
  tone,
}: {
  k: string;
  v: string | React.ReactNode;
  tone?: "success" | "warn" | "danger";
}) {
  const c =
    tone === "success"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-destructive"
          : "text-fg-2";
  return (
    <div className="flex items-center gap-2 border-b border-border py-1.5 text-[11.5px] last:border-b-0">
      <span className="flex-1 text-um-muted">{k}</span>
      <span className={cn("font-mono font-medium tabular-nums", c)}>{v}</span>
    </div>
  );
}
