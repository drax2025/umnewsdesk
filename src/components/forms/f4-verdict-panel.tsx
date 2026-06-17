"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  RotateCcw,
  ShieldX,
} from "lucide-react";
import {
  setInterlinkerVerdict,
  type InterlinkActionResult,
} from "@/lib/actions/interlinks";
import {
  F4_VERDICTS,
  MAX_INTERNAL_LINKS,
  MAX_OUTBOUND_LINKS,
  MIN_OUTBOUND_LINKS,
  summariseInterlinks,
  type ArticleInterlinkRow,
  type ArticleInterlinkerRow,
  type F4Verdict,
} from "@/lib/spec/f4-interlinks";
import { cn } from "@/lib/utils";

/**
 * F4 verdict panel.
 *
 * Top: live roll-up of placed/candidate/rejected + counts vs B4 ceilings.
 * Middle: blocker list (any C7 fail blocks HAND TO F5).
 * Bottom: 3 verdict buttons + rationale.
 */

const VERDICT_ICON: Record<F4Verdict, React.ComponentType<{ className?: string }>> = {
  hand_to_f5: CheckCircle2,
  hand_back_to_f3: RotateCcw,
  escalate: ShieldX,
};

const textareaCls =
  "min-h-[72px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

export function F4VerdictPanel({
  articleId,
  rows,
  record,
}: {
  articleId: string;
  rows: ArticleInterlinkRow[];
  record: ArticleInterlinkerRow | null;
}) {
  const [rationale, setRationale] = useState<string>(
    record?.verdict_rationale ?? "",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const summary = summariseInterlinks(rows);

  function submit(verdict: F4Verdict) {
    setError(null);
    setNotice(null);
    if (!rationale.trim()) {
      setError("Rationale is required to stamp a verdict.");
      return;
    }
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("verdict", verdict);
    fd.set("verdict_rationale", rationale);
    startTransition(async () => {
      const res: InterlinkActionResult = await setInterlinkerVerdict(fd);
      if (!res.ok) setError(res.error);
      else setNotice("Verdict stamped.");
    });
  }

  const current = record?.verdict ?? null;

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-um-muted" />
          <h2 className="text-[12.5px] font-semibold text-foreground">
            F4 verdict
          </h2>
          {current ? (
            <span className="font-mono text-[10.5px] text-fg-2">
              current:{" "}
              {F4_VERDICTS.find((v) => v.value === current)?.label}
              {record?.verdict_at ? (
                <span className="ml-1 text-um-muted">
                  ·{" "}
                  {new Date(record.verdict_at).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </header>

      {/* Roll-up */}
      <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
        <RollChip
          label="Internal placed"
          value={summary.internalPlaced}
          ceiling={MAX_INTERNAL_LINKS}
          tone={
            summary.internalPlaced > MAX_INTERNAL_LINKS
              ? "destructive"
              : "success"
          }
        />
        <RollChip
          label="Outbound placed"
          value={summary.outboundPlaced}
          ceiling={MAX_OUTBOUND_LINKS}
          floor={MIN_OUTBOUND_LINKS}
          tone={
            summary.outboundPlaced < MIN_OUTBOUND_LINKS ||
            summary.outboundPlaced > MAX_OUTBOUND_LINKS
              ? "destructive"
              : "success"
          }
        />
        <RollChip
          label="Candidates open"
          value={summary.internalCandidates + summary.outboundCandidates}
          tone="muted"
        />
        <RollChip
          label="Broken / banned"
          value={summary.brokenLinks + summary.bannedHits}
          tone={
            summary.brokenLinks + summary.bannedHits > 0
              ? "destructive"
              : "muted"
          }
        />
      </div>

      <div className="px-4 py-4">
        {!summary.ready ? (
          <div className="mb-3 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[11px] text-warn">
            <div className="mb-1 flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span className="font-semibold">
                {summary.blockers.length} C7/B4 blocker
                {summary.blockers.length === 1 ? "" : "s"} — cannot HAND TO F5.
              </span>
            </div>
            <ul className="ml-5 list-disc space-y-0.5 text-warn/90">
              {summary.blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mb-3 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5 text-[11px] text-success">
            <CheckCircle2 className="mr-1 inline h-3 w-3" />
            All C7 invariants satisfied. Ready to hand to F5.
          </div>
        )}

        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="One paragraph. Note the placed links, any rejected candidates and why, and any E4 recency notes. Stamps into the F7 Pre-Flight Pack."
          className={textareaCls}
          maxLength={2400}
        />

        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {F4_VERDICTS.map((v) => {
            const Icon = VERDICT_ICON[v.value];
            const disabled =
              pending || (v.value === "hand_to_f5" && !summary.ready);
            const tone =
              v.tone === "success"
                ? "border-success/45 bg-success/10 text-success hover:bg-success/15"
                : v.tone === "warn"
                  ? "border-warn/45 bg-warn/10 text-warn hover:bg-warn/15"
                  : "border-destructive/45 bg-destructive/10 text-destructive hover:bg-destructive/15";
            return (
              <button
                key={v.value}
                type="button"
                disabled={disabled}
                onClick={() => submit(v.value)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors disabled:opacity-50",
                  tone,
                )}
              >
                <span className="flex items-center gap-1.5 text-[11.5px] font-bold tracking-[0.03em]">
                  <Icon className="h-3.5 w-3.5" />
                  {v.label}
                </span>
                <span className="text-[10px] text-um-muted">{v.hint}</span>
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
            {error}
          </div>
        ) : null}
        {notice && !error ? (
          <div className="mt-3 rounded-md border border-success/35 bg-success/10 px-2.5 py-1.5 text-[11.5px] text-success">
            {notice}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RollChip({
  label,
  value,
  ceiling,
  floor,
  tone,
}: {
  label: string;
  value: number;
  ceiling?: number;
  floor?: number;
  tone: "success" | "warn" | "destructive" | "muted";
}) {
  const cls =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "warn"
        ? "bg-warn/10 text-warn"
        : tone === "destructive"
          ? "bg-destructive/10 text-destructive"
          : "bg-card text-fg-2";
  const range =
    floor !== undefined && ceiling !== undefined
      ? `${floor}–${ceiling}`
      : ceiling !== undefined
        ? `≤ ${ceiling}`
        : null;
  return (
    <div className={cn("flex flex-col items-center gap-0.5 px-2 py-2", cls)}>
      <span className="font-mono text-[18px] font-bold tabular-nums">
        {value}
      </span>
      <span className="text-[9.5px] uppercase tracking-[0.06em] text-um-muted">
        {label}
      </span>
      {range ? (
        <span className="font-mono text-[9px] text-um-muted">
          target {range}
        </span>
      ) : null}
    </div>
  );
}
