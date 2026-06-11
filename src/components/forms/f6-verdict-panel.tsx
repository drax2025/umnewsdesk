"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Gavel,
  RotateCcw,
  ShieldX,
} from "lucide-react";
import {
  setReviewVerdict,
  type ReviewActionResult,
} from "@/lib/actions/review";
import {
  F6_VERDICTS,
  summariseReview,
  type ArticleReviewRow,
  type F6Verdict,
} from "@/lib/spec/f6-review";
import { cn } from "@/lib/utils";

/**
 * F6 verdict stamp panel.
 *
 * Renders the live gate-roll summary and seven verdict buttons. HAND-TO-F9
 * is gated client-side on "ready" (all gates non-pending, zero hard fails);
 * the server action re-checks the same invariant.
 */

const VERDICT_ICON: Record<F6Verdict, React.ComponentType<{ className?: string }>> = {
  hand_to_f9: CheckCircle2,
  return_to_f1: RotateCcw,
  return_to_f2: RotateCcw,
  return_to_f3: RotateCcw,
  return_to_f4: RotateCcw,
  return_to_f5: RotateCcw,
  escalate: ShieldX,
};

const textareaCls =
  "min-h-[72px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

export function F6VerdictPanel({
  articleId,
  review,
}: {
  articleId: string;
  review: ArticleReviewRow | null;
}) {
  const [rationale, setRationale] = useState<string>(
    review?.verdict_rationale ?? "",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const summary = summariseReview(review);

  function submit(verdict: F6Verdict) {
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
      const res: ReviewActionResult = await setReviewVerdict(fd);
      if (!res.ok) setError(res.error);
      else setNotice("Verdict stamped.");
    });
  }

  const current = review?.verdict ?? null;

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Gavel className="h-3.5 w-3.5 text-um-muted" />
          <h2 className="text-[12.5px] font-semibold text-foreground">
            F6 verdict
          </h2>
          {current ? (
            <span className="font-mono text-[10.5px] text-fg-2">
              current:{" "}
              {F6_VERDICTS.find((v) => v.value === current)?.label}
              {review?.verdict_at ? (
                <span className="ml-1 text-um-muted">
                  ·{" "}
                  {new Date(review.verdict_at).toLocaleString("en-GB", {
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
      <div className="grid grid-cols-5 gap-px border-b border-border bg-border">
        <RollChip label="Pass" value={summary.pass} tone="success" />
        <RollChip label="Soft-fail" value={summary.soft} tone="warn" />
        <RollChip label="Fail" value={summary.fail} tone="destructive" />
        <RollChip label="N/A" value={summary.na} tone="muted" />
        <RollChip label="Pending" value={summary.pending} tone="muted" />
      </div>

      <div className="px-4 py-4">
        {!summary.ready ? (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[11px] text-warn">
            <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <span>
              {summary.pending > 0
                ? `${summary.pending} gate${summary.pending === 1 ? "" : "s"} still pending.`
                : `${summary.hardFails} hard-gate fail${summary.hardFails === 1 ? "" : "s"} — cannot HAND TO F9.`}
            </span>
          </div>
        ) : null}

        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="One paragraph. Reference the failing or passing gates by code. This stamps into the audit trail and into the F9 pack."
          className={textareaCls}
          maxLength={2400}
        />

        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {F6_VERDICTS.map((v) => {
            const Icon = VERDICT_ICON[v.value];
            const disabled =
              pending ||
              (v.value === "hand_to_f9" && !summary.ready);
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
  tone,
}: {
  label: string;
  value: number;
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
  return (
    <div className={cn("flex flex-col items-center gap-0.5 px-2 py-2", cls)}>
      <span className="font-mono text-[18px] font-bold tabular-nums">{value}</span>
      <span className="text-[9.5px] uppercase tracking-[0.06em] text-um-muted">
        {label}
      </span>
    </div>
  );
}
