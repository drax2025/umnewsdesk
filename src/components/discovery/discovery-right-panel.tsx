"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, SidebarOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible right-hand panel for the Discovery Overview page.
 *
 * State is persisted in localStorage under `umd:discovery-rpanel:collapsed`
 * so the publisher's choice survives a reload — nobody wants to re-collapse
 * the panel every time they navigate back to /discovery.
 *
 * Hydration story: we start in the "expanded" default so the first paint
 * matches the SSR output (which doesn't know what localStorage says),
 * then sync on mount. The single re-render is invisible because the
 * collapsed strip and the expanded panel are styled to look like sane
 * intermediate states.
 *
 * Data is passed in as plain serialisable props from the Server
 * Component page; this client component owns no Supabase access.
 */

const STORAGE_KEY = "umd:discovery-rpanel:collapsed";
const SWEEP_BADGE: Record<string, string> = {
  complete: "border-success/35 bg-success/10 text-success",
  running: "border-state-comm/35 bg-state-comm/10 text-state-comm",
  partial: "border-warn/35 bg-warn/10 text-warn",
  failed: "border-destructive/35 bg-destructive/10 text-destructive",
};

export type RPanelRun = {
  id: string;
  code: string;
  slot: "am" | "pm";
  status: "running" | "complete" | "partial" | "failed";
  started_at: string;
  candidates_total: number;
  parse_failures: number;
  not_reached: number;
};

export type RPanelSource = {
  id: string;
  name: string;
  code: string;
  status: "active" | "warning" | "critical" | "paused";
};

export type RPanelProps = {
  runs: RPanelRun[];
  sources: RPanelSource[];
  healthOk: number;
  healthWarn: number;
  healthFail: number;
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false }).slice(0, 8);
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

export function DiscoveryRightPanel({
  runs,
  sources,
  healthOk,
  healthWarn,
  healthFail,
}: RPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      // localStorage blocked (private mode / SSR). Stay expanded.
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

  // Collapsed: skinny vertical strip with an expand button + rotated label.
  // Only renders at lg+ to match the original aside breakpoint.
  if (collapsed) {
    return (
      <aside
        className={cn(
          "hidden w-[36px] flex-shrink-0 flex-col items-center border-l border-border bg-card lg:flex",
          // Avoid a flash of the expand-arrow in the wrong place during the
          // first paint pre-hydration: fade in once we know the stored value.
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
            Recent runs · source health
          </span>
        </button>
        <div className="flex w-full flex-col items-center gap-1.5 border-t border-border py-2 text-[9.5px]">
          <span className="font-mono tabular-nums text-success" title="Sources OK">
            {healthOk}
          </span>
          <span className="font-mono tabular-nums text-warn" title="Sources warn">
            {healthWarn}
          </span>
          <span
            className="font-mono tabular-nums text-destructive"
            title="Sources critical"
          >
            {healthFail}
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "hidden w-[300px] flex-shrink-0 flex-col overflow-y-auto border-l border-border bg-card lg:flex xl:w-[340px]",
      )}
    >
      {/* Header strip with collapse toggle — sits above the first
          RPanelHead so the toggle is always reachable without scrolling. */}
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
              <span className="text-[10px] text-um-muted">
                {dayLabel(r.started_at)}
              </span>
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

      <RPanelHead
        title="Source Health"
        linkLabel="Monitor →"
        linkHref="/system/source-health"
      />
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
                (s.status === "critical" || s.status === "paused") &&
                  "bg-destructive",
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
        <Link
          href={linkHref}
          className="text-[10.5px] font-medium text-primary hover:underline"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

function SrcLegend({
  tone,
  label,
  count,
}: {
  tone: "ok" | "warn" | "fail";
  label: string;
  count: number;
}) {
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
