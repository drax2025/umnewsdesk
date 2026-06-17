"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ShieldX, Trash2 } from "lucide-react";
import {
  deleteFailure,
  logFailure,
  type PreFlightActionResult,
} from "@/lib/actions/pre-flight";
import {
  A_CHECK_CODES,
  ROOT_CAUSE_AGENTS,
  type ACheckCode,
  type PreFlightFailureRow,
  type RootCauseAgent,
} from "@/lib/spec/f7-pre-flight";
import { cn } from "@/lib/utils";

/**
 * F7 Failure Log. Lives below the A-checks, above the verdict panel.
 *
 *   - Top: existing failures rendered with delete buttons
 *   - Bottom: append form (check code, severity, root-cause agent, description,
 *     remediation note)
 *
 * Failures are append-only audit rows. Sourced via SK-RECORD.append-failure-log-row.
 */

const labelCls =
  "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";
const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const selectCls =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-[12.5px] text-foreground focus:border-primary/40 focus:outline-none";
const textareaCls =
  "min-h-[64px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

type Severity = "soft_fail" | "fail";

export function F7FailureLog({
  articleId,
  failures,
}: {
  articleId: string;
  failures: PreFlightFailureRow[];
}) {
  const [checkCode, setCheckCode] = useState<ACheckCode>("A1");
  const [severity, setSeverity] = useState<Severity>("fail");
  const [root, setRoot] = useState<RootCauseAgent>("F2");
  const [description, setDescription] = useState<string>("");
  const [remediation, setRemediation] = useState<string>("");

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    setNotice(null);
    if (!description.trim()) {
      setError("Describe the failure (required).");
      return;
    }
    fd.set("article_id", articleId);
    fd.set("check_code", checkCode);
    fd.set("status", severity);
    fd.set("root_cause_agent", root);
    fd.set("description", description);
    fd.set("remediation", remediation);
    startTransition(async () => {
      const res: PreFlightActionResult = await logFailure(fd);
      if (!res.ok) setError(res.error);
      else {
        setNotice("Failure logged.");
        setDescription("");
        setRemediation("");
      }
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-um-muted" />
          <h2 className="text-[12.5px] font-semibold text-foreground">
            Failure Log
          </h2>
          <span className="font-mono text-[10.5px] text-fg-2">
            · {failures.length} on file
          </span>
        </div>
        <span className="text-[10.5px] text-um-muted">
          Append-only audit. One row per A-check failure.
        </span>
      </header>

      {/* Existing rows */}
      <div className="divide-y divide-border">
        {failures.length === 0 ? (
          <p className="px-4 py-3 text-[11.5px] italic text-um-muted">
            No failures recorded yet. Soft-fails and hard-fails on any A-check
            land here for the F7 audit trail.
          </p>
        ) : null}
        {failures.map((f) => (
          <FailureRow key={f.id} articleId={articleId} failure={f} />
        ))}
      </div>

      {/* Append form */}
      <form action={submit} className="border-t border-border px-4 py-3">
        <div className="mb-2 grid grid-cols-3 gap-2.5">
          <div>
            <label className={labelCls} htmlFor="fl-code">
              Check
            </label>
            <select
              id="fl-code"
              value={checkCode}
              onChange={(e) => setCheckCode(e.target.value as ACheckCode)}
              className={cn(selectCls, "mt-1 font-mono")}
            >
              {A_CHECK_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="fl-sev">
              Severity
            </label>
            <select
              id="fl-sev"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              className={cn(selectCls, "mt-1")}
            >
              <option value="fail">Hard FAIL</option>
              <option value="soft_fail">Soft-fail</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="fl-root">
              Root-cause agent
            </label>
            <select
              id="fl-root"
              value={root}
              onChange={(e) => setRoot(e.target.value as RootCauseAgent)}
              className={cn(selectCls, "mt-1 font-mono")}
            >
              {ROOT_CAUSE_AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-2">
          <label className={labelCls} htmlFor="fl-desc">
            Description
          </label>
          <textarea
            id="fl-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What failed, what was expected, what was observed."
            className={cn(textareaCls, "mt-1")}
            maxLength={2400}
          />
        </div>

        <div className="mb-2">
          <label className={labelCls} htmlFor="fl-rem">
            Remediation note
          </label>
          <input
            id="fl-rem"
            type="text"
            value={remediation}
            onChange={(e) => setRemediation(e.target.value)}
            placeholder="What the upstream agent must do to clear it (optional)."
            className={cn(inputCls, "mt-1")}
            maxLength={400}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-[10.5px] text-um-muted">
            {error ? (
              <span className="text-destructive">{error}</span>
            ) : notice ? (
              <span className="text-success">{notice}</span>
            ) : (
              <span>Append a new row to the audit log.</span>
            )}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="h-7 rounded-md border border-warn/45 bg-warn/10 px-3 text-[11px] font-semibold text-warn hover:bg-warn/15 disabled:opacity-60"
          >
            {pending ? "Logging…" : "Append failure"}
          </button>
        </div>
      </form>
    </section>
  );
}

function FailureRow({
  articleId,
  failure,
}: {
  articleId: string;
  failure: PreFlightFailureRow;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    const fd = new FormData();
    fd.set("id", failure.id);
    fd.set("article_id", articleId);
    startTransition(async () => {
      const res = await deleteFailure(fd);
      if (!res.ok) setError(res.error);
    });
  }

  const Icon = failure.status === "fail" ? ShieldX : AlertTriangle;
  const tone =
    failure.status === "fail"
      ? "border-destructive/45 bg-destructive/5 text-destructive"
      : "border-warn/45 bg-warn/5 text-warn";

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-7 flex-shrink-0 items-center gap-1 rounded-md border px-2 text-[10.5px] font-bold uppercase tracking-[0.04em]",
            tone,
          )}
        >
          <Icon className="h-3 w-3" />
          {failure.check_code}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline gap-2">
            <span className="text-[11px] font-semibold text-foreground">
              {failure.status === "fail" ? "Hard FAIL" : "Soft-fail"}
            </span>
            {failure.root_cause_agent ? (
              <span className="font-mono text-[10.5px] text-um-muted">
                · root cause {failure.root_cause_agent}
              </span>
            ) : null}
            <span className="font-mono text-[10.5px] text-um-muted">
              ·{" "}
              {new Date(failure.created_at).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <p className="text-[12px] leading-[1.5] text-foreground">
            {failure.description}
          </p>
          {failure.remediation ? (
            <p className="mt-1 text-[11px] leading-[1.5] text-fg-2">
              <span className="font-semibold text-um-muted">Remediation: </span>
              {failure.remediation}
            </p>
          ) : null}
          {failure.override_applied ? (
            <p className="mt-1 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-[10.5px] text-warn">
              Override applied
              {failure.override_reason ? `: ${failure.override_reason}` : "."}
            </p>
          ) : null}
          {error ? (
            <p className="mt-1 text-[10.5px] text-destructive">{error}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label="Delete failure"
          className="h-7 flex-shrink-0 rounded-md border border-border bg-background px-2 text-um-muted hover:bg-secondary hover:text-destructive disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
