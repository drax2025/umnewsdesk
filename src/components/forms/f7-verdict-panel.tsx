"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Package,
  RotateCcw,
  Zap,
} from "lucide-react";
import {
  setF7Verdict,
  stampF7Tier1Defaults,
  type PreFlightActionResult,
} from "@/lib/actions/pre-flight";
import {
  F7_VERDICTS,
  summarisePreFlight,
  type ArticlePreFlightRow,
  type F7Verdict,
} from "@/lib/spec/f7-pre-flight";
import { cn } from "@/lib/utils";

/**
 * F7 Pre-Flight Check verdict stamp panel.
 *
 * Renders the live A-check roll-up and seven verdict buttons. HAND TO
 * SENIOR EDITOR is gated client-side on `summary.ready` (zero hard fails,
 * zero pending). The server action re-checks the same invariant.
 */

const VERDICT_ICON: Record<F7Verdict, React.ComponentType<{ className?: string }>> = {
  hand_to_senior_editor: CheckCircle2,
  return_to_f1: RotateCcw,
  return_to_f2: RotateCcw,
  return_to_f3: RotateCcw,
  return_to_f4: RotateCcw,
  return_to_f5: RotateCcw,
  return_to_f6: RotateCcw,
};

/**
 * Where each F7 verdict lands the editor next. HAND TO SENIOR EDITOR leaves
 * them on the F7 page so they can assemble the pack in the panel below
 * (the next thing they need to do is right there). Returns route back to
 * the article dossier where the upstream agent owns the fix.
 */
function destinationFor(
  verdict: F7Verdict,
  articleId: string,
): { href: string; label: string } | null {
  switch (verdict) {
    case "hand_to_senior_editor":
      return null; // stay on page — pack assembly is in the panel below
    case "return_to_f1":
    case "return_to_f2":
    case "return_to_f3":
    case "return_to_f4":
    case "return_to_f5":
    case "return_to_f6":
      return { href: `/articles/${articleId}`, label: "article dossier" };
  }
}

const textareaCls =
  "min-h-[72px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

export function F7VerdictPanel({
  articleId,
  row,
  defamationTier,
  isPrPiece = false,
}: {
  articleId: string;
  row: ArticlePreFlightRow | null;
  defamationTier: 1 | 2 | 3 | null;
  /** PR pieces (production option 1/2) don't require a verdict rationale. */
  isPrPiece?: boolean;
}) {
  const router = useRouter();
  const [rationale, setRationale] = useState<string>(
    row?.verdict_rationale ?? "",
  );
  const [pending, startTransition] = useTransition();
  const [stamping, startStamping] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const summary = summarisePreFlight(row);

  // Tier 1 PR pass-throughs are 90% of routine volume. One-click stamps the
  // 10-check default profile so the editor doesn't have to save each A-row.
  function stampDefaults() {
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.set("article_id", articleId);
    startStamping(async () => {
      const res: PreFlightActionResult = await stampF7Tier1Defaults(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice("Tier 1 defaults stamped across all 10 A-checks.");
      // Same refresh-after-action contract as the F6 panel.
      router.refresh();
    });
  }

  function submit(verdict: F7Verdict) {
    setError(null);
    setNotice(null);
    if (!isPrPiece && !rationale.trim()) {
      setError("Rationale is required to stamp a verdict.");
      return;
    }
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("verdict", verdict);
    fd.set("verdict_rationale", rationale);
    startTransition(async () => {
      const res: PreFlightActionResult = await setF7Verdict(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const dest = destinationFor(verdict, articleId);
      if (dest) {
        setNotice(`Verdict stamped — routing to ${dest.label}…`);
        router.push(dest.href);
      } else {
        // hand_to_senior_editor: pack assembly panel is on this page, so just
        // refresh so the gating unlocks and the editor can mint a pack ref.
        setNotice("Verdict stamped — assemble the pack below.");
        router.refresh();
      }
    });
  }

  const current = row?.verdict ?? null;

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Package className="h-3.5 w-3.5 text-um-muted" />
          <h2 className="text-[12.5px] font-semibold text-foreground">
            F7 verdict
          </h2>
          {current ? (
            <span className="font-mono text-[10.5px] text-fg-2">
              current:{" "}
              {F7_VERDICTS.find((v) => v.value === current)?.label}
              {row?.verdict_at ? (
                <span className="ml-1 text-um-muted">
                  ·{" "}
                  {new Date(row.verdict_at).toLocaleString("en-GB", {
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
        {current === "hand_to_senior_editor" ? (
          <a
            href="#pub-approval"
            className="mb-3 flex items-center justify-between gap-2 rounded-md border border-primary/45 bg-primary/10 px-2.5 py-2 text-[11.5px] leading-[1.4] text-primary transition-colors hover:bg-primary/15"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Handed to Admin. Next step: stamp the{" "}
                <strong>[PUB] APPROVE</strong> in the Pre-Flight Pack at the
                bottom of this page.
              </span>
            </span>
            <span className="flex flex-shrink-0 items-center gap-1 font-semibold">
              Go to [PUB]
              <ArrowDown className="h-3.5 w-3.5" />
            </span>
          </a>
        ) : null}

        {!summary.ready ? (
          <div className="mb-3 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[11px] text-warn">
            <div className="mb-1 flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span className="font-semibold">
                {summary.blockers.length} blocker
                {summary.blockers.length === 1 ? "" : "s"} — cannot hand to Admin.
              </span>
            </div>
            <ul className="ml-5 list-disc space-y-0.5 text-warn/90">
              {summary.blockers.slice(0, 6).map((b, i) => (
                <li key={i}>{b}</li>
              ))}
              {summary.blockers.length > 6 ? (
                <li className="italic text-warn/70">
                  …and {summary.blockers.length - 6} more.
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <div className="mb-3 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5 text-[11px] text-success">
            <CheckCircle2 className="mr-1 inline h-3 w-3" />
            All A-checks clear. Article is ready for the Admin pack.
          </div>
        )}

        {/* Tier 1 PR fast-path. Mirrors the F6 panel — only surfaces on T1
            articles that still have pending A-checks, to avoid clutter on
            cases that need real adjudication. */}
        {defamationTier === 1 && summary.pending > 0 ? (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2">
            <div className="min-w-0 text-[11px] leading-[1.4] text-fg-2">
              <div className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-primary">
                <Zap className="h-3 w-3" />
                Tier 1 PR fast-path
              </div>
              <p className="mt-0.5">
                Bulk-stamp all 10 A-checks with the standard PR profile (A2, A4-A10 PASS,
                A1 + A3 N/A). A6 backdate and A8 headline chars auto-fill from source.
                Use only on routine pass-through releases.
              </p>
            </div>
            <button
              type="button"
              disabled={stamping}
              onClick={stampDefaults}
              className="h-7 flex-shrink-0 rounded-md border border-primary/45 bg-primary/15 px-3 text-[11px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
            >
              {stamping ? "Stamping…" : "Stamp Tier 1 defaults"}
            </button>
          </div>
        ) : null}

        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder={
            isPrPiece
              ? "Optional for PR pieces. Note the A-checks that drove the decision if you want a record in the Pre-Flight Pack."
              : "One paragraph. Reference the A-checks that drove the decision. Stamps into the audit trail and into the Pre-Flight Pack."
          }
          className={textareaCls}
          maxLength={2400}
        />

        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {F7_VERDICTS.map((v) => {
            const Icon = VERDICT_ICON[v.value];
            const disabled =
              pending ||
              (v.value === "hand_to_senior_editor" && !summary.ready);
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
