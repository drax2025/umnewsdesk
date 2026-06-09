"use client";

import { useState, useTransition } from "react";
import {
  toggleSourceSignalOnly,
  updateSourceExclusivity,
  updateSourceStatus,
} from "@/lib/actions/sources";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = ["active", "warning", "critical", "paused"] as const;

export function StatusCell({ id, value }: { id: string; value: string }) {
  const [pending, startTransition] = useTransition();
  const tone =
    value === "active"
      ? "text-success"
      : value === "warning"
        ? "text-warn"
        : value === "critical"
          ? "text-destructive"
          : "text-um-muted";
  return (
    <form
      action={(fd) => startTransition(() => updateSourceStatus(fd))}
      className="inline-block"
    >
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={value}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn(
          "h-6 cursor-pointer rounded-sm border border-border bg-background px-1.5 text-[11px] capitalize focus:border-primary focus:outline-none disabled:opacity-60",
          tone,
        )}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}

export function ExclusivityCell({ id, value }: { id: string; value: number }) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(value);
  return (
    <form
      action={(fd) => startTransition(() => updateSourceExclusivity(fd))}
      className="inline-flex items-center gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <input
        type="number"
        name="exclusivity_window_hours"
        min={0}
        max={720}
        value={current}
        disabled={pending}
        onChange={(e) => setCurrent(Number.parseInt(e.currentTarget.value, 10) || 0)}
        onBlur={(e) => {
          if (Number.parseInt(e.currentTarget.value, 10) !== value) {
            e.currentTarget.form?.requestSubmit();
          }
        }}
        className="h-6 w-14 rounded-sm border border-border bg-background px-1.5 text-right font-mono text-[11px] tabular-nums text-fg-2 focus:border-primary focus:outline-none disabled:opacity-60"
      />
      <span className="font-mono text-[10.5px] text-um-muted">h</span>
    </form>
  );
}

export function SignalOnlyCell({ id, value }: { id: string; value: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => startTransition(() => toggleSourceSignalOnly(fd))}
      className="inline-block"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="signal_only_eligible" value={(!value).toString()} />
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "h-6 rounded-sm border px-2 text-[11px] font-medium transition-colors disabled:opacity-60",
          value
            ? "border-state-comm/40 bg-state-comm/10 text-state-comm hover:bg-state-comm/15"
            : "border-border bg-background text-um-muted hover:bg-secondary",
        )}
      >
        {value ? "Yes" : "Off"}
      </button>
    </form>
  );
}
