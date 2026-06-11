"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, RotateCcw, ShieldX, Scale } from "lucide-react";
import {
  saveResearchRecord,
  setResearchVerdict,
  type ResearchActionResult,
} from "@/lib/actions/research";
import {
  DEPENDENCY_STATUS,
  FEASIBILITY,
  VERDICTS,
  type ArticleResearchRow,
  type DependencyStatus,
  type F2Verdict,
  type FramingFeasibility,
} from "@/lib/spec/f2-research";
import { cn } from "@/lib/utils";

/**
 * F2 Verdict + framing-feasibility + dependency + NFP footer panel.
 *
 * Three stacked decisions, all on one record:
 *
 *   1. Framing feasibility (spec F2 step 6).
 *      SUPPORTED → proceed to F3. WEAK / UNSUPPORTED → hand back to F1.
 *
 *   2. Dependency status (spec B2 audit).
 *      CLEAN if no signal-only outlets are in use. DIGIT/FUTURESCOT/SFN-EXPOSED
 *      if any are, which forces a B6 paper-trail comment from the Reviewer.
 *
 *   3. F2 verdict (spec F2 step 8).
 *      Hand to F3 Writer, hand back to F1, or route to reject. Verdict is
 *      stamped with the editor's id and the timestamp on save.
 *
 * NFP footer (B8 / C9) is drafted here and finalised by the Writer.
 */

type Props = {
  articleId: string;
  research: ArticleResearchRow | null;
};

const FEAS_TONE: Record<FramingFeasibility, string> = {
  supported: "border-success/45 bg-success/10 text-success",
  weak: "border-warn/45 bg-warn/10 text-warn",
  unsupported: "border-destructive/45 bg-destructive/10 text-destructive",
};

const DEP_TONE: Record<DependencyStatus, string> = {
  clean: "border-success/45 bg-success/10 text-success",
  digit_exposed: "border-destructive/45 bg-destructive/10 text-destructive",
  futurescot_exposed: "border-destructive/45 bg-destructive/10 text-destructive",
  sfn_exposed: "border-destructive/45 bg-destructive/10 text-destructive",
};

const VERDICT_ICON: Record<F2Verdict, React.ComponentType<{ className?: string }>> = {
  hand_to_f3: CheckCircle2,
  hand_back_to_f1: RotateCcw,
  route_to_reject: ShieldX,
};

const labelCls =
  "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";
const textareaCls =
  "min-h-[80px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

export function F2VerdictPanel({ articleId, research }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [feasibility, setFeasibility] = useState<FramingFeasibility | null>(
    research?.framing_feasibility ?? null,
  );
  const [dependency, setDependency] = useState<DependencyStatus | null>(
    research?.dependency_status ?? null,
  );
  const [paywalled, setPaywalled] = useState<boolean>(
    research?.primary_paywalled ?? false,
  );

  /* ── Save record (partial save of feasibility / dependency / NFP) ────── */
  function saveRecord(fd: FormData) {
    setError(null);
    setNotice(null);
    fd.set("article_id", articleId);
    if (feasibility) fd.set("framing_feasibility", feasibility);
    else fd.delete("framing_feasibility");
    if (dependency) fd.set("dependency_status", dependency);
    else fd.delete("dependency_status");
    fd.set("primary_paywalled", paywalled ? "1" : "");

    startTransition(async () => {
      const res: ResearchActionResult = await saveResearchRecord(fd);
      if (!res.ok) setError(res.error);
      else setNotice("Saved.");
    });
  }

  /* ── Verdict transition ──────────────────────────────────────────────── */
  function submitVerdict(verdict: F2Verdict, rationale: string) {
    setError(null);
    setNotice(null);
    if (verdict === "hand_to_f3" && feasibility !== "supported") {
      setError(
        "Frame must be SUPPORTED before handing to F3. Save the feasibility verdict first.",
      );
      return;
    }
    if (!rationale.trim()) {
      setError("Rationale is required when stamping the verdict.");
      return;
    }
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("verdict", verdict);
    fd.set("verdict_rationale", rationale);
    startTransition(async () => {
      const res = await setResearchVerdict(fd);
      if (!res.ok) setError(res.error);
      else setNotice("Verdict stamped.");
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="text-[12.5px] font-semibold text-foreground">
          F2 · Feasibility + verdict
        </h2>
        <p className="mt-0.5 text-[10.5px] text-um-muted">
          Decide framing support, signal-only exposure, and the F2 verdict.
        </p>
      </header>

      <form action={saveRecord} className="flex flex-col gap-5 px-4 py-4">
        {/* Framing feasibility */}
        <div>
          <label className={labelCls}>Framing feasibility</label>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {FEASIBILITY.map((f) => (
              <button
                type="button"
                key={f.value}
                onClick={() =>
                  setFeasibility(feasibility === f.value ? null : f.value)
                }
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                  feasibility === f.value
                    ? FEAS_TONE[f.value]
                    : "border-border bg-background text-fg-2 hover:bg-secondary",
                )}
              >
                <span className="text-[11.5px] font-bold tracking-[0.04em]">
                  {f.label}
                </span>
                <span className="text-[10px] text-um-muted">{f.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Evidence */}
        <div>
          <label className={labelCls} htmlFor="v-evidence">
            Feasibility evidence
          </label>
          <textarea
            id="v-evidence"
            name="feasibility_evidence"
            defaultValue={research?.feasibility_evidence ?? ""}
            placeholder="Which public-record material supports (or fails to support) the assigned frame? Cite the sources by name."
            className={cn(textareaCls, "mt-1")}
            maxLength={2400}
          />
        </div>

        {/* Dependency status */}
        <div>
          <label className={labelCls}>Dependency status (B2)</label>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {DEPENDENCY_STATUS.map((d) => (
              <button
                type="button"
                key={d.value}
                onClick={() =>
                  setDependency(dependency === d.value ? null : d.value)
                }
                className={cn(
                  "rounded-md border px-2 py-1.5 text-center text-[11px] font-bold tracking-[0.03em] transition-colors",
                  dependency === d.value
                    ? DEP_TONE[d.value]
                    : "border-border bg-background text-fg-2 hover:bg-secondary",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10.5px] text-um-muted">
            Anything other than CLEAN forces B6 paper-trail comments and a
            note in the F6 H8 dependency audit.
          </p>
        </div>

        {/* Primary paywalled */}
        <div className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2.5">
          <input
            id="v-paywalled"
            type="checkbox"
            checked={paywalled}
            onChange={(e) => setPaywalled(e.target.checked)}
            className="mt-0.5"
          />
          <label htmlFor="v-paywalled" className="text-[11.5px] text-fg-2">
            Primary source is paywalled.
            <span className="ml-1 text-um-muted">
              Triggers route-to-reject as default verdict per F2 step 1.
            </span>
          </label>
        </div>

        {/* NFP footer draft (B8 / C9) */}
        <div>
          <label className={labelCls} htmlFor="v-nfp">
            NFP footer draft (B8 / C9)
          </label>
          <textarea
            id="v-nfp"
            name="nfp_footer_draft"
            defaultValue={research?.nfp_footer_draft ?? ""}
            placeholder="Draft the non-for-publication footer: source pointers, dependency notes, anything the Writer needs to know but the reader does not."
            className={cn(textareaCls, "mt-1 min-h-[120px] font-mono text-[11.5px]")}
            maxLength={2400}
          />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <div className="text-[10.5px] text-um-muted">
            {research?.updated_at ? (
              <>
                Last saved{" "}
                <span className="font-mono tabular-nums text-fg-2">
                  {new Date(research.updated_at).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </>
            ) : (
              <span className="italic">Unsaved</span>
            )}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="h-7 rounded-md border border-border bg-background px-3 text-[11.5px] font-semibold text-fg-2 hover:bg-secondary disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save research record"}
          </button>
        </div>
      </form>

      {/* Verdict stamp */}
      <div className="border-t border-border bg-background/50 px-4 py-4">
        <VerdictStamp
          research={research}
          onSubmit={submitVerdict}
          pending={pending}
        />
      </div>

      {error ? (
        <div className="border-t border-destructive/35 bg-destructive/10 px-4 py-2 text-[11.5px] text-destructive">
          {error}
        </div>
      ) : null}
      {notice && !error ? (
        <div className="border-t border-success/35 bg-success/10 px-4 py-2 text-[11.5px] text-success">
          {notice}
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Verdict stamp                                                             */
/* -------------------------------------------------------------------------- */

function VerdictStamp({
  research,
  onSubmit,
  pending,
}: {
  research: ArticleResearchRow | null;
  onSubmit: (verdict: F2Verdict, rationale: string) => void;
  pending: boolean;
}) {
  const [rationale, setRationale] = useState<string>(
    research?.verdict_rationale ?? "",
  );

  const current = research?.verdict ?? null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <Scale className="h-3.5 w-3.5 text-um-muted" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          F2 Verdict
        </span>
        {current ? (
          <span className="font-mono text-[10.5px] text-fg-2">
            current: {VERDICTS.find((v) => v.value === current)?.label}
            {research?.verdict_at ? (
              <span className="ml-1 text-um-muted">
                ·{" "}
                {new Date(research.verdict_at).toLocaleString("en-GB", {
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

      <textarea
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder="Two sentences. Why this verdict — anchored in the sources, the frame, the dependency state."
        className={cn(textareaCls, "mb-2")}
        maxLength={2400}
      />

      <div className="grid grid-cols-3 gap-1.5">
        {VERDICTS.map((v) => {
          const Icon = VERDICT_ICON[v.value];
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
              disabled={pending}
              onClick={() => onSubmit(v.value, rationale)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors disabled:opacity-60",
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
    </div>
  );
}
