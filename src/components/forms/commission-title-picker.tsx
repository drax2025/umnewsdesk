"use client";

import { useEffect, useState } from "react";
import { commissionFromCandidate } from "@/lib/actions/commissioning";

/**
 * Commission button + inline title picker.
 *
 * Replaces the bare `<form action={commissionFromCandidate}>` that used to
 * commission every candidate against whatever title sorted oldest in the
 * `titles` table. With multiple active titles (Silicon Scotland, finance silo,
 * etc.) the editor needs to pick which publication an incoming candidate
 * belongs to per-row.
 *
 * Behaviour:
 *   - If only one active title exists, the select is hidden and the button
 *     behaves identically to the old inline form — no UX regression.
 *   - With multiple titles, a compact `<select>` appears next to the button.
 *     The editor's last choice is remembered in sessionStorage so they don't
 *     have to re-pick on every row when batch-commissioning a feed.
 *   - The action validates the chosen title_id is active server-side; an
 *     inactive or unknown id silently falls back to the oldest active title.
 *
 * Two visual variants mirror the two existing call sites:
 *   - "success" — inbox triage row (the historical green Commission button)
 *   - "primary" — commissioning queue card (the blue Commission → button)
 */

const STORAGE_KEY = "um:commission:last-title-id";

export type CommissionTitleOption = {
  id: string;
  name: string;
};

type Variant = "success" | "primary";

export function CommissionTitlePicker({
  candidateId,
  titles,
  label = "Commission",
  variant = "success",
}: {
  candidateId: string;
  titles: CommissionTitleOption[];
  label?: string;
  variant?: Variant;
}) {
  // Initial render uses the first title for SSR stability; the effect below
  // swaps in the editor's stored preference on mount. Anything else (reading
  // sessionStorage during render) breaks SSR.
  const [titleId, setTitleId] = useState<string>(titles[0]?.id ?? "");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const last = window.sessionStorage.getItem(STORAGE_KEY);
    if (last && titles.some((t) => t.id === last)) {
      setTitleId(last);
    }
  }, [titles]);

  function persist(next: string) {
    setTitleId(next);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, next);
    }
  }

  // No active titles — render nothing so the row doesn't show a dead button.
  // /system/titles surfaces the empty state already.
  if (titles.length === 0) return null;

  const btnCls =
    variant === "primary"
      ? "rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary hover:bg-primary/15"
      : "h-6 rounded-sm border border-success/40 bg-success/10 px-2 text-[10.5px] font-medium text-success transition-colors hover:bg-success/15";

  const selectCls =
    "h-6 max-w-[140px] truncate rounded-sm border border-border bg-background px-1.5 text-[10.5px] text-fg-2 focus:border-primary/40 focus:outline-none";

  return (
    <form
      action={commissionFromCandidate}
      className="inline-flex items-center gap-1"
    >
      <input type="hidden" name="candidate_id" value={candidateId} />
      <input type="hidden" name="title_id" value={titleId} />
      {titles.length > 1 ? (
        <select
          value={titleId}
          onChange={(e) => persist(e.target.value)}
          className={selectCls}
          title="Publication silo this article will be commissioned into"
          aria-label="Publication silo"
        >
          {titles.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="submit"
        className={btnCls}
        title={
          titles.length === 1
            ? `Create article + commission into ${titles[0].name}`
            : "Create article + commission into the selected publication"
        }
      >
        {label}
      </button>
    </form>
  );
}
