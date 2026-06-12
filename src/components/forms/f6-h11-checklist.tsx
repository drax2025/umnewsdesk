"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scale, ShieldX } from "lucide-react";
import {
  saveH11Checklist,
  type ReviewActionResult,
} from "@/lib/actions/review";
import {
  computeH11Status,
  GATES,
  H11_DEFENCES,
  H11_QUESTIONS,
  type ArticleReviewRow,
  type HGateStatus,
  type H11Question,
} from "@/lib/spec/f6-review";
import { cn } from "@/lib/utils";

/**
 * F6 H11 — Defamation triage checklist (D-Checklist).
 *
 * Renders the ten yes/no questions plus the Defamation Act 2013 defence
 * picker, the public-record response URL, and a free-text detail box for
 * the gate audit row.
 *
 * Tier 1 → auto-N/A (we render a banner explaining and skip the questions).
 * Tier 3 → routes to reject queue, also N/A here.
 *
 * Computed status:
 *   - Q3-Q9 all YES + Q10 NO          → PASS
 *   - Any "Q3-Q9 NO" or "Q10 YES"    → FAIL
 *   - Any unanswered question         → PENDING
 *
 * The computed status is shown live; the editor must click Save to commit
 * (the action also writes the gate status onto the article_review row).
 */

const labelCls =
  "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";
const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const textareaCls =
  "min-h-[64px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

const STATUS_TONE: Record<HGateStatus, string> = {
  pending: "border-border-mid text-um-muted",
  pass: "border-success/45 bg-success/10 text-success",
  soft_fail: "border-warn/45 bg-warn/10 text-warn",
  fail: "border-destructive/45 bg-destructive/10 text-destructive",
  na: "border-border-mid bg-secondary text-fg-2",
};

type Props = {
  articleId: string;
  defamationTier: 1 | 2 | 3 | null;
  review: ArticleReviewRow | null;
};

type AnswerMap = Partial<Record<H11Question["key"], boolean | null>>;

export function F6H11Checklist({ articleId, defamationTier, review }: Props) {
  const initial: AnswerMap = {
    h11_q1_identifies_subject: review?.h11_q1_identifies_subject ?? null,
    h11_q2_factual_claim: review?.h11_q2_factual_claim ?? null,
    h11_q3_claim_provable: review?.h11_q3_claim_provable ?? null,
    h11_q4_comment_basis_stated: review?.h11_q4_comment_basis_stated ?? null,
    h11_q5_inference_framed: review?.h11_q5_inference_framed ?? null,
    h11_q6_response_cited: review?.h11_q6_response_cited ?? null,
    h11_q7_defence_identified: review?.h11_q7_defence_identified ?? null,
    h11_q8_third_parties_considered:
      review?.h11_q8_third_parties_considered ?? null,
    h11_q9_distinguished_categories:
      review?.h11_q9_distinguished_categories ?? null,
    h11_q10_unsupported_sentence: review?.h11_q10_unsupported_sentence ?? null,
  };

  const router = useRouter();
  const [answers, setAnswers] = useState<AnswerMap>(initial);
  const [defence, setDefence] = useState<string>(review?.h11_defence ?? "");
  const [responseUrl, setResponseUrl] = useState<string>(
    review?.h11_response_url ?? "",
  );
  const [detail, setDetail] = useState<string>(review?.h11_detail ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);

  const computed = computeH11Status(defamationTier, answers);
  const gate = GATES.find((g) => g.code === "H11")!;

  // Tier 1 / Tier 3 — N/A short-circuit
  if (defamationTier === 1 || defamationTier === 3) {
    return <H11NaBanner tier={defamationTier} articleId={articleId} />;
  }

  // Tier null — show prompt to set tier
  if (defamationTier === null) {
    return (
      <section className="rounded-lg border border-warn/35 bg-warn/5 p-4">
        <h3 className="text-[12px] font-semibold text-foreground">
          H11 · D-Checklist — defamation tier not set
        </h3>
        <p className="mt-1 text-[11.5px] text-warn">
          Set the defamation tier on the F1 Triage scorecard before completing
          H11. Tier 1 auto-marks H11 as N/A; Tier 2 runs the checklist; Tier 3
          routes to the Reject Queue.
        </p>
      </section>
    );
  }

  // Tier 2 — full form
  function setAnswer(key: H11Question["key"], v: boolean | null) {
    setAnswers((cur) => ({ ...cur, [key]: v }));
  }

  function submit(fd: FormData) {
    setError(null);
    setSaved(false);
    fd.set("article_id", articleId);
    fd.set("status", computed === "pending" ? "pending" : computed);
    fd.set("defence", defence);
    fd.set("response_url", responseUrl);
    fd.set("h11_detail", detail);
    for (const q of H11_QUESTIONS) {
      const v = answers[q.key];
      fd.set(
        `q${q.num}`,
        v === true ? "yes" : v === false ? "no" : "",
      );
    }
    startTransition(async () => {
      const res: ReviewActionResult = await saveH11Checklist(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form
      action={submit}
      className={cn(
        "rounded-lg border bg-card p-4",
        computed === "fail"
          ? "border-destructive/40"
          : computed === "pass"
            ? "border-success/40"
            : "border-border",
      )}
    >
      <div className="mb-3 flex items-start gap-3">
        <div className="flex w-[64px] flex-shrink-0 flex-col items-start gap-0.5">
          <span className="font-mono text-[13px] font-bold tracking-[0.04em] text-foreground">
            H11
          </span>
          <span className="rounded-sm border border-destructive/45 bg-destructive/10 px-1 text-[9px] font-bold uppercase tracking-[0.06em] text-destructive">
            HARD
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline gap-2">
            <h3 className="text-[12.5px] font-semibold text-foreground">
              {gate.label}
            </h3>
            <span className="font-mono text-[10.5px] text-um-muted">
              spec {gate.spec}
            </span>
            <span className="rounded-sm border border-warn/45 bg-warn/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-warn">
              Tier 2
            </span>
            <span
              className={cn(
                "ml-auto rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.04em]",
                STATUS_TONE[computed],
              )}
              title="Live-computed from the checklist below."
            >
              {computed.toUpperCase()}
            </span>
          </div>
          <p className="text-[11px] leading-[1.5] text-fg-2">
            All ten questions must be answered in the NFP footer. PASS requires
            YES to Q3-Q9 and NO to Q10. Any FAIL routes back to F1 — typically
            into the Reject Queue.
          </p>
        </div>
      </div>

      {/* Questions */}
      <ol className="space-y-1.5">
        {H11_QUESTIONS.map((q) => {
          const v = answers[q.key];
          const required = q.passOn;
          const failed =
            v !== null &&
            v !== undefined &&
            ((required === "yes" && v !== true) ||
              (required === "no" && v !== false));
          return (
            <li
              key={q.key}
              className={cn(
                "flex items-start gap-2 rounded-md border bg-background px-2.5 py-1.5",
                failed ? "border-destructive/40" : "border-border",
              )}
            >
              <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[10.5px] font-bold text-fg-2">
                {q.num}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] leading-[1.4] text-foreground">
                  {q.text}
                </p>
                {required !== "any" ? (
                  <p className="mt-0.5 text-[9.5px] uppercase tracking-[0.05em] text-um-muted">
                    PASS requires {required === "yes" ? "YES" : "NO"}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-shrink-0 gap-1">
                <YesNoPill
                  active={v === true}
                  onClick={() => setAnswer(q.key, v === true ? null : true)}
                  label="Yes"
                  highlight={required === "yes"}
                />
                <YesNoPill
                  active={v === false}
                  onClick={() => setAnswer(q.key, v === false ? null : false)}
                  label="No"
                  highlight={required === "no"}
                />
              </div>
            </li>
          );
        })}
      </ol>

      {/* Defence + URL */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls} htmlFor="h11-defence">
            Defamation Act 2013 defence
          </label>
          <select
            id="h11-defence"
            value={defence}
            onChange={(e) => setDefence(e.target.value)}
            className={cn(inputCls, "mt-1")}
          >
            <option value="">— Select defence</option>
            {H11_DEFENCES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="h11-url">
            Public-record response URL
          </label>
          <input
            id="h11-url"
            value={responseUrl}
            onChange={(e) => setResponseUrl(e.target.value)}
            placeholder="https://"
            className={cn(inputCls, "mt-1 font-mono text-[11.5px]")}
            maxLength={2048}
          />
        </div>
      </div>

      {/* Detail */}
      <div className="mt-2.5">
        <label className={labelCls} htmlFor="h11-detail">
          Audit detail (goes into the gate trail)
        </label>
        <textarea
          id="h11-detail"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="One paragraph summarising the checklist outcome and the defence justification."
          className={cn(textareaCls, "mt-1")}
          maxLength={2400}
        />
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <div className="text-[10.5px] text-um-muted">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : saved ? (
            <span className="text-success">Saved.</span>
          ) : computed === "pending" ? (
            <span>Answer all ten questions to compute status.</span>
          ) : (
            <span>Computed status: {computed.toUpperCase()}</span>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="h-7 rounded-md border border-primary/45 bg-primary/15 px-3 text-[11px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save H11"}
        </button>
      </div>
    </form>
  );
}

function YesNoPill({
  active,
  onClick,
  label,
  highlight,
}: {
  active: boolean;
  onClick: () => void;
  label: "Yes" | "No";
  highlight: boolean;
}) {
  const isPassAnswer = highlight;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.03em] transition-colors",
        active
          ? isPassAnswer
            ? "border-success/45 bg-success/15 text-success"
            : "border-warn/45 bg-warn/15 text-warn"
          : "border-border bg-background text-fg-2 hover:bg-secondary",
      )}
    >
      {label}
    </button>
  );
}

function H11NaBanner({
  tier,
  articleId,
}: {
  tier: 1 | 3;
  articleId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function markNA() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("article_id", articleId);
      fd.set("status", "na");
      fd.set("h11_detail", tier === 1
        ? "Tier 1 article — D-Checklist N/A per spec D-Checklist."
        : "Tier 3 article — routes to Reject Queue. H11 N/A here.");
      const res = await saveH11Checklist(fd);
      if (res.ok) {
        setDone(true);
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <ShieldX className="mt-0.5 h-4 w-4 text-um-muted" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[12.5px] font-semibold text-foreground">
            H11 · Defamation triage —{" "}
            <span className="font-mono text-um-muted">N/A</span>
          </h3>
          <p className="mt-1 text-[11.5px] leading-[1.5] text-fg-2">
            {tier === 1
              ? "This is a Tier 1 article (standard, neutral/positive). The D-Checklist does not apply per spec D-Checklist."
              : "This is a Tier 3 article. Tier 3 stories route to the Reject Queue — H11 is not run here."}
          </p>
        </div>
        <button
          type="button"
          disabled={pending || done}
          onClick={markNA}
          className="h-7 flex-shrink-0 rounded-md border border-border bg-background px-3 text-[11px] font-semibold text-fg-2 hover:bg-secondary disabled:opacity-60"
        >
          {done ? "Marked N/A" : pending ? "Saving…" : "Mark H11 N/A"}
        </button>
      </div>
      <p className="mt-2 flex items-center gap-1 text-[10.5px] text-um-muted">
        <Scale className="h-3 w-3" />
        Spec D-Checklist + F6 H11.
      </p>
    </section>
  );
}
