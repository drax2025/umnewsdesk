"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  MinusCircle,
  ShieldX,
} from "lucide-react";
import { saveGate, type ReviewActionResult } from "@/lib/actions/review";
import {
  GATE_STATUS,
  type ArticleReviewRow,
  type GateDef,
  type HGateStatus,
} from "@/lib/spec/f6-review";
import { cn } from "@/lib/utils";

/**
 * A single F6 gate row. Renders:
 *
 *   - Gate code (H1-H11), HARD/SOFT tag, label, spec ref
 *   - One-line method hint (collapsed by default)
 *   - Status picker (pending / pass / soft-fail / fail / n/a)
 *   - Optional metric field (word count, link count, headline chars)
 *   - Detail textarea (what was checked, what the outcome was)
 *   - Save button
 *
 * H11 has its own dedicated component — pass `disableSave` on H11 and render
 * the row read-only with the checklist underneath.
 */

const labelCls =
  "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";
const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const textareaCls =
  "min-h-[64px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

const STATUS_ICON: Record<HGateStatus, React.ComponentType<{ className?: string }>> = {
  pending: Circle,
  pass: CheckCircle2,
  soft_fail: AlertTriangle,
  fail: ShieldX,
  na: MinusCircle,
};

const STATUS_TONE: Record<HGateStatus, string> = {
  pending: "border-border-mid text-um-muted",
  pass: "border-success/45 bg-success/10 text-success",
  soft_fail: "border-warn/45 bg-warn/10 text-warn",
  fail: "border-destructive/45 bg-destructive/10 text-destructive",
  na: "border-border-mid bg-secondary text-fg-2",
};

type Props = {
  articleId: string;
  gate: GateDef;
  review: ArticleReviewRow | null;
  readOnly?: boolean;
};

export function F6GateRow({ articleId, gate, review, readOnly }: Props) {
  const prefix = gate.code.toLowerCase() as
    | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
    | "h7" | "h8" | "h9" | "h10" | "h11";

  const initialStatus: HGateStatus =
    (review?.[`${prefix}_status` as keyof ArticleReviewRow] as HGateStatus) ??
    "pending";
  const initialDetail =
    (review?.[`${prefix}_detail` as keyof ArticleReviewRow] as string | null) ??
    "";

  const initialMetric: number | null =
    gate.code === "H6"
      ? review?.h6_word_count ?? null
      : gate.code === "H7"
        ? review?.h7_internal_link_count ?? null
        : gate.code === "H8"
          ? review?.h8_headline_chars ?? null
          : null;

  const router = useRouter();
  const [status, setStatus] = useState<HGateStatus>(initialStatus);
  const [detail, setDetail] = useState<string>(initialDetail);
  const [metric, setMetric] = useState<string>(
    initialMetric !== null ? String(initialMetric) : "",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);

  function submit(fd: FormData) {
    setError(null);
    setSaved(false);
    fd.set("article_id", articleId);
    fd.set("gate", gate.code);
    fd.set("status", status);
    fd.set("detail", detail);
    if (gate.code === "H6") fd.set("word_count", metric);
    if (gate.code === "H7") fd.set("internal_link_count", metric);
    if (gate.code === "H8") fd.set("headline_chars", metric);

    startTransition(async () => {
      const res: ReviewActionResult = await saveGate(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      // Force the parent server component to re-render so the verdict roll-up
      // at the top of the page reflects this gate's new status. revalidatePath
      // invalidates the cache but doesn't push fresh data into mounted client
      // components.
      router.refresh();
    });
  }

  const StatusIcon = STATUS_ICON[status];

  return (
    <form
      action={submit}
      className={cn(
        "rounded-lg border bg-card p-3.5",
        status === "fail" && gate.kind === "hard"
          ? "border-destructive/40"
          : status === "soft_fail"
            ? "border-warn/40"
            : status === "pass"
              ? "border-success/40"
              : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Code + kind */}
        <div className="flex w-[64px] flex-shrink-0 flex-col items-start gap-0.5">
          <span className="font-mono text-[13px] font-bold tracking-[0.04em] text-foreground">
            {gate.code}
          </span>
          <span
            className={cn(
              "rounded-sm border px-1 text-[9px] font-bold uppercase tracking-[0.06em]",
              gate.kind === "hard"
                ? "border-destructive/45 bg-destructive/10 text-destructive"
                : "border-warn/45 bg-warn/10 text-warn",
            )}
          >
            {gate.kind === "hard" ? "HARD" : "SOFT"}
          </span>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline gap-2">
            <h3 className="text-[12.5px] font-semibold text-foreground">
              {gate.label}
            </h3>
            <span className="font-mono text-[10.5px] text-um-muted">
              spec {gate.spec}
            </span>
            <span className="font-mono text-[10.5px] text-um-muted">
              · returns to {gate.returns_to}
            </span>
          </div>
          <p className="mb-2.5 text-[11px] leading-[1.5] text-fg-2">
            {gate.method}
          </p>

          {/* Status picker */}
          <div className="mb-2.5 flex flex-wrap gap-1">
            {GATE_STATUS.map((s) => (
              <button
                type="button"
                key={s.value}
                disabled={readOnly}
                onClick={() => setStatus(s.value)}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60",
                  status === s.value
                    ? STATUS_TONE[s.value]
                    : "border-border bg-background text-fg-2 hover:bg-secondary",
                )}
              >
                <StatusFor value={s.value} />
                {s.short}
              </button>
            ))}
          </div>

          {/* Optional metric row */}
          {gate.code === "H6" || gate.code === "H7" || gate.code === "H8" ? (
            <div className="mb-2.5 grid grid-cols-3 gap-2.5">
              <div>
                <label className={labelCls}>
                  {gate.code === "H6"
                    ? "Word count"
                    : gate.code === "H7"
                      ? "Internal links"
                      : "Headline chars"}
                </label>
                <input
                  type="number"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                  placeholder={
                    gate.code === "H6"
                      ? "500-750"
                      : gate.code === "H7"
                        ? "0-3"
                        : "≤ 90"
                  }
                  className={cn(inputCls, "mt-1 font-mono tabular-nums")}
                  readOnly={readOnly}
                />
              </div>
            </div>
          ) : null}

          {/* Detail */}
          <div>
            <label className={labelCls} htmlFor={`${prefix}-detail`}>
              Detail
            </label>
            <textarea
              id={`${prefix}-detail`}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="What was checked, what the outcome was, any flags raised."
              className={cn(textareaCls, "mt-1")}
              readOnly={readOnly}
              maxLength={2400}
            />
          </div>

          {/* Footer */}
          {!readOnly ? (
            <div className="mt-2 flex items-center justify-between">
              <div className="text-[10.5px] text-um-muted">
                {error ? (
                  <span className="text-destructive">{error}</span>
                ) : saved ? (
                  <span className="text-success">Saved.</span>
                ) : (
                  <span>
                    <StatusIcon className="mr-0.5 inline h-3 w-3" />
                    {GATE_STATUS.find((s) => s.value === status)?.label}
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={pending}
                className="h-7 rounded-md border border-primary/45 bg-primary/15 px-3 text-[11px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
              >
                {pending ? "Saving…" : `Save ${gate.code}`}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function StatusFor({ value }: { value: HGateStatus }) {
  const I = STATUS_ICON[value];
  return <I className="h-3 w-3" />;
}
