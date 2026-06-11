"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  MinusCircle,
  ShieldX,
} from "lucide-react";
import {
  saveCheck,
  type PrePublishActionResult,
} from "@/lib/actions/pre-publish";
import {
  A_CHECK_STATUS,
  type ACheckDef,
  type ACheckStatus,
  type ArticlePrePublishRow,
} from "@/lib/spec/f9-pre-publish";
import { cn } from "@/lib/utils";

/**
 * F9 A-check row. Renders:
 *
 *   - Check code (A1-A10), HARD/SOFT tag, label, spec ref, root-cause agent
 *   - Method hint
 *   - Status picker (pending / pass / soft-fail / fail / n/a) with glyphs
 *   - Per-check metric fields (independent count, quotes sampled, backdate,
 *     interlink counts, headline chars)
 *   - Detail textarea
 *   - Save button
 */

const labelCls =
  "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";
const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const textareaCls =
  "min-h-[64px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

const STATUS_ICON: Record<ACheckStatus, React.ComponentType<{ className?: string }>> = {
  pending: Circle,
  pass: CheckCircle2,
  soft_fail: AlertTriangle,
  fail: ShieldX,
  na: MinusCircle,
};

const STATUS_TONE: Record<ACheckStatus, string> = {
  pending: "border-border-mid text-um-muted",
  pass: "border-success/45 bg-success/10 text-success",
  soft_fail: "border-warn/45 bg-warn/10 text-warn",
  fail: "border-destructive/45 bg-destructive/10 text-destructive",
  na: "border-border-mid bg-secondary text-fg-2",
};

type Props = {
  articleId: string;
  check: ACheckDef;
  row: ArticlePrePublishRow | null;
  readOnly?: boolean;
};

export function F9CheckRow({ articleId, check, row, readOnly }: Props) {
  const prefix = check.code.toLowerCase() as
    | "a1" | "a2" | "a3" | "a4" | "a5"
    | "a6" | "a7" | "a8" | "a9" | "a10";

  const initialStatus: ACheckStatus =
    (row?.[`${prefix}_status` as keyof ArticlePrePublishRow] as ACheckStatus) ??
    "pending";
  const initialDetail =
    (row?.[`${prefix}_detail` as keyof ArticlePrePublishRow] as string | null) ??
    "";

  // Pre-load any per-check metric.
  const initialIndependentCount =
    check.code === "A3" ? row?.a3_independent_count ?? null : null;
  const initialQuotesSampled =
    check.code === "A4" ? row?.a4_quotes_sampled ?? null : null;
  const initialBackdate =
    check.code === "A6" ? row?.a6_backdate ?? null : null;
  const initialInternalCount =
    check.code === "A7" ? row?.a7_internal_count ?? null : null;
  const initialOutboundCount =
    check.code === "A7" ? row?.a7_outbound_count ?? null : null;
  const initialHeadlineChars =
    check.code === "A8" ? row?.a8_headline_chars ?? null : null;

  const [status, setStatus] = useState<ACheckStatus>(initialStatus);
  const [detail, setDetail] = useState<string>(initialDetail);

  const [independentCount, setIndependentCount] = useState<string>(
    initialIndependentCount !== null ? String(initialIndependentCount) : "",
  );
  const [quotesSampled, setQuotesSampled] = useState<string>(
    initialQuotesSampled !== null ? String(initialQuotesSampled) : "",
  );
  const [backdate, setBackdate] = useState<string>(initialBackdate ?? "");
  const [internalCount, setInternalCount] = useState<string>(
    initialInternalCount !== null ? String(initialInternalCount) : "",
  );
  const [outboundCount, setOutboundCount] = useState<string>(
    initialOutboundCount !== null ? String(initialOutboundCount) : "",
  );
  const [headlineChars, setHeadlineChars] = useState<string>(
    initialHeadlineChars !== null ? String(initialHeadlineChars) : "",
  );

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);

  function submit(fd: FormData) {
    setError(null);
    setSaved(false);
    fd.set("article_id", articleId);
    fd.set("check", check.code);
    fd.set("status", status);
    fd.set("detail", detail);
    if (check.code === "A3") fd.set("independent_count", independentCount);
    if (check.code === "A4") fd.set("quotes_sampled", quotesSampled);
    if (check.code === "A6") fd.set("backdate", backdate);
    if (check.code === "A7") {
      fd.set("internal_count", internalCount);
      fd.set("outbound_count", outboundCount);
    }
    if (check.code === "A8") fd.set("headline_chars", headlineChars);

    startTransition(async () => {
      const res: PrePublishActionResult = await saveCheck(fd);
      if (!res.ok) setError(res.error);
      else setSaved(true);
    });
  }

  const StatusIcon = STATUS_ICON[status];
  const statusLabel = A_CHECK_STATUS.find((s) => s.value === status)?.label;

  return (
    <form
      action={submit}
      className={cn(
        "rounded-lg border bg-card p-3.5",
        status === "fail" && check.kind === "hard"
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
            {check.code}
          </span>
          <span
            className={cn(
              "rounded-sm border px-1 text-[9px] font-bold uppercase tracking-[0.06em]",
              check.kind === "hard"
                ? "border-destructive/45 bg-destructive/10 text-destructive"
                : "border-warn/45 bg-warn/10 text-warn",
            )}
          >
            {check.kind === "hard" ? "HARD" : "SOFT"}
          </span>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline gap-2">
            <h3 className="text-[12.5px] font-semibold text-foreground">
              {check.label}
            </h3>
            <span className="font-mono text-[10.5px] text-um-muted">
              spec {check.spec}
            </span>
            <span className="font-mono text-[10.5px] text-um-muted">
              · root cause {check.rootCause}
            </span>
          </div>
          <p className="mb-2.5 text-[11px] leading-[1.5] text-fg-2">
            {check.method}
          </p>

          {/* Status picker */}
          <div className="mb-2.5 flex flex-wrap gap-1">
            {A_CHECK_STATUS.map((s) => (
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
                <span aria-hidden className="text-[12px] leading-none">
                  {s.glyph}
                </span>
                {s.short}
              </button>
            ))}
          </div>

          {/* Per-check metric fields */}
          {check.code === "A3" ? (
            <div className="mb-2.5 grid grid-cols-3 gap-2.5">
              <div>
                <label className={labelCls} htmlFor={`${prefix}-ind`}>
                  Independent confirmations
                </label>
                <input
                  id={`${prefix}-ind`}
                  type="number"
                  value={independentCount}
                  onChange={(e) => setIndependentCount(e.target.value)}
                  placeholder="≥ 3 for PDT"
                  className={cn(inputCls, "mt-1 font-mono tabular-nums")}
                  readOnly={readOnly}
                />
              </div>
            </div>
          ) : null}

          {check.code === "A4" ? (
            <div className="mb-2.5 grid grid-cols-3 gap-2.5">
              <div>
                <label className={labelCls} htmlFor={`${prefix}-qs`}>
                  Quotes spot-checked
                </label>
                <input
                  id={`${prefix}-qs`}
                  type="number"
                  value={quotesSampled}
                  onChange={(e) => setQuotesSampled(e.target.value)}
                  placeholder="N sampled vs ledger"
                  className={cn(inputCls, "mt-1 font-mono tabular-nums")}
                  readOnly={readOnly}
                />
              </div>
            </div>
          ) : null}

          {check.code === "A6" ? (
            <div className="mb-2.5 grid grid-cols-3 gap-2.5">
              <div>
                <label className={labelCls} htmlFor={`${prefix}-bd`}>
                  Selected backdate (F5)
                </label>
                <input
                  id={`${prefix}-bd`}
                  type="date"
                  value={backdate}
                  onChange={(e) => setBackdate(e.target.value)}
                  className={cn(inputCls, "mt-1 font-mono tabular-nums")}
                  readOnly={readOnly}
                />
              </div>
            </div>
          ) : null}

          {check.code === "A7" ? (
            <div className="mb-2.5 grid grid-cols-3 gap-2.5">
              <div>
                <label className={labelCls} htmlFor={`${prefix}-int`}>
                  Internal placed (0-3)
                </label>
                <input
                  id={`${prefix}-int`}
                  type="number"
                  value={internalCount}
                  onChange={(e) => setInternalCount(e.target.value)}
                  placeholder="0-3"
                  className={cn(inputCls, "mt-1 font-mono tabular-nums")}
                  readOnly={readOnly}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor={`${prefix}-out`}>
                  Outbound placed (3-5)
                </label>
                <input
                  id={`${prefix}-out`}
                  type="number"
                  value={outboundCount}
                  onChange={(e) => setOutboundCount(e.target.value)}
                  placeholder="3-5"
                  className={cn(inputCls, "mt-1 font-mono tabular-nums")}
                  readOnly={readOnly}
                />
              </div>
            </div>
          ) : null}

          {check.code === "A8" ? (
            <div className="mb-2.5 grid grid-cols-3 gap-2.5">
              <div>
                <label className={labelCls} htmlFor={`${prefix}-hc`}>
                  Headline characters
                </label>
                <input
                  id={`${prefix}-hc`}
                  type="number"
                  value={headlineChars}
                  onChange={(e) => setHeadlineChars(e.target.value)}
                  placeholder="≤ 90"
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
              placeholder="What you spot-checked, the URLs you re-opened, the verdict reasoning, any soft-fail rationale."
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
                    {statusLabel}
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={pending}
                className="h-7 rounded-md border border-primary/45 bg-primary/15 px-3 text-[11px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
              >
                {pending ? "Saving…" : `Save ${check.code}`}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}
