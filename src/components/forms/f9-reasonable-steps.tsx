"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  Scale,
  ShieldOff,
} from "lucide-react";
import {
  DEFENCES,
  REASONABLE_STEPS_FIELD_LABELS,
  summariseReasonableSteps,
  type ArticleReasonableStepsRow,
  type DefamationDefence,
  type ReasonableStepsField,
} from "@/lib/spec/f9-reasonable-steps";
import {
  saveReasonableSteps,
  type PrePublishActionResult,
} from "@/lib/actions/pre-publish";
import { cn } from "@/lib/utils";

/**
 * F9 Pack section 8 — Reasonable-steps log (Tier 2 only).
 *
 * Renders six fields:
 *   - Subjects named (comma- or newline-separated)
 *   - Right-of-reply URL + date (the public record)
 *   - Defamation Act 2013 defence (radio)
 *   - One-sentence justification for the defence
 *   - Name of the editor who classified the tier (snapshot)
 *
 * If the article is Tier 1 / Tier 3 / unknown, the surface renders an
 * explanatory non-form panel — Tier 1 has no reasonable-steps requirement and
 * Tier 3 should never reach this stage.
 */

type Props = {
  articleId: string;
  row: ArticleReasonableStepsRow | null;
  defamationTier: 1 | 2 | 3 | null;
  readOnly?: boolean;
};

export function ReasonableStepsLog({
  articleId,
  row,
  defamationTier,
  readOnly = false,
}: Props) {
  if (defamationTier !== 2) {
    return <NotApplicablePanel tier={defamationTier} />;
  }

  return (
    <ReasonableStepsForm
      articleId={articleId}
      row={row}
      readOnly={readOnly}
    />
  );
}

function NotApplicablePanel({ tier }: { tier: 1 | 2 | 3 | null }) {
  const copy =
    tier === 1
      ? "Tier 1 article — no defamation framework required. Reasonable-steps log is not applicable."
      : tier === 3
        ? "Tier 3 article — F1 should have disqualified this article upstream. Reasonable-steps log is not collected at F9."
        : "Defamation tier not yet resolved. Set the tier in F1 / F2 before completing the reasonable-steps log.";

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border bg-background/40 px-3 py-2">
        <Scale className="h-3.5 w-3.5 text-um-muted" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          Reasonable-steps log · pack section 8
        </h2>
        <span className="ml-auto flex items-center gap-1 rounded-sm border border-um-muted/40 bg-um-muted/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-um-muted">
          <ShieldOff className="h-3 w-3" />
          N/A
        </span>
      </header>
      <p className="px-3 py-3 text-[11.5px] leading-[1.5] text-um-muted">
        {copy}
      </p>
    </section>
  );
}

function ReasonableStepsForm({
  articleId,
  row,
  readOnly,
}: {
  articleId: string;
  row: ArticleReasonableStepsRow | null;
  readOnly: boolean;
}) {
  const [subjectsNamed, setSubjectsNamed] = useState<string>(
    row?.subjects_named ?? "",
  );
  const [responseUrl, setResponseUrl] = useState<string>(
    row?.public_record_response_url ?? "",
  );
  const [responseDate, setResponseDate] = useState<string>(
    row?.public_record_response_date ?? "",
  );
  const [defence, setDefence] = useState<DefamationDefence | null>(
    row?.defence ?? null,
  );
  const [defenceJustification, setDefenceJustification] = useState<string>(
    row?.defence_justification ?? "",
  );
  const [classifierName, setClassifierName] = useState<string>(
    row?.tier_classifier_name ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);
  const [pending, startTransition] = useTransition();

  const liveRow: ArticleReasonableStepsRow = {
    article_id: articleId,
    subjects_named: subjectsNamed || null,
    public_record_response_url: responseUrl || null,
    public_record_response_date: responseDate || null,
    defence: defence,
    defence_justification: defenceJustification || null,
    tier_classifier_id: row?.tier_classifier_id ?? null,
    tier_classifier_name: classifierName || null,
    updated_at: row?.updated_at ?? new Date().toISOString(),
  };
  const summary = summariseReasonableSteps(liveRow, 2);

  function save() {
    if (readOnly) return;
    setError(null);
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("subjects_named", subjectsNamed);
    fd.set("public_record_response_url", responseUrl);
    fd.set("public_record_response_date", responseDate);
    if (defence) fd.set("defence", defence);
    fd.set("defence_justification", defenceJustification);
    fd.set("tier_classifier_name", classifierName);

    startTransition(async () => {
      const res: PrePublishActionResult = await saveReasonableSteps(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-background/40 px-3 py-2">
        <Scale className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          Reasonable-steps log · pack section 8 · Tier 2
        </h2>
        <span className="ml-auto font-mono text-[10.5px] text-um-muted">
          {summary.status === "complete"
            ? "all fields populated"
            : `${summary.missing.length} field${summary.missing.length === 1 ? "" : "s"} missing`}
        </span>
        {summary.status === "complete" ? (
          <span className="flex items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-success">
            <CheckCircle2 className="h-3 w-3" />
            complete
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-warn">
            <AlertTriangle className="h-3 w-3" />
            incomplete
          </span>
        )}
        {!readOnly ? (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="flex h-7 items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save log
          </button>
        ) : null}
      </header>

      <p className="border-b border-border bg-background/30 px-3 py-2 text-[10.5px] leading-[1.5] text-um-muted">
        D-Steps doctrine — record who was named, what right-of-reply response is
        on the public record, which Defamation Act 2013 defence is selected, and
        why. Required for every Tier 2 article that proceeds to production.
      </p>

      <div className="grid gap-3 px-3 py-3 sm:grid-cols-2">
        <Field
          label="Subjects named"
          field="subjects_named"
          missing={summary.missing}
        >
          <textarea
            rows={3}
            value={subjectsNamed}
            onChange={(e) => setSubjectsNamed(e.target.value)}
            disabled={readOnly || pending}
            placeholder="One per line, or comma-separated"
            maxLength={1200}
            className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-foreground placeholder:text-um-muted disabled:opacity-60"
          />
        </Field>

        <Field
          label="Tier classifier (name on record)"
          field="tier_classifier_name"
          missing={summary.missing}
        >
          <input
            type="text"
            value={classifierName}
            onChange={(e) => setClassifierName(e.target.value)}
            disabled={readOnly || pending}
            placeholder="Editor who classified the tier"
            maxLength={240}
            className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12px] text-foreground placeholder:text-um-muted disabled:opacity-60"
          />
        </Field>

        <Field
          label="Right-of-reply URL"
          field="public_record_response_url"
          missing={summary.missing}
        >
          <input
            type="url"
            value={responseUrl}
            onChange={(e) => setResponseUrl(e.target.value)}
            disabled={readOnly || pending}
            placeholder="https://…"
            maxLength={1200}
            className="h-8 w-full rounded-md border border-border bg-background px-2.5 font-mono text-[11px] text-foreground placeholder:text-um-muted disabled:opacity-60"
          />
        </Field>

        <Field
          label="Right-of-reply date"
          field="public_record_response_date"
          missing={summary.missing}
        >
          <input
            type="date"
            value={responseDate}
            onChange={(e) => setResponseDate(e.target.value)}
            disabled={readOnly || pending}
            className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-[12px] text-foreground disabled:opacity-50"
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Defamation Act 2013 defence" field="defence" missing={summary.missing}>
            <div className="flex flex-wrap gap-1.5">
              {DEFENCES.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDefence(d.value)}
                  disabled={readOnly || pending}
                  title={`${d.act_ref} — ${d.hint}`}
                  className={cn(
                    "flex flex-col items-start rounded-md border px-2 py-1 text-left transition-colors disabled:opacity-50",
                    defence === d.value
                      ? "border-primary/45 bg-primary/10 text-primary"
                      : "border-border bg-background text-fg-2 hover:bg-secondary",
                  )}
                >
                  <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em]">
                    {d.short}
                  </span>
                  <span className="text-[10.5px] leading-[1.3]">{d.act_ref}</span>
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field
            label="Defence justification (one sentence)"
            field="defence_justification"
            missing={summary.missing}
          >
            <textarea
              rows={2}
              value={defenceJustification}
              onChange={(e) => setDefenceJustification(e.target.value)}
              disabled={readOnly || pending}
              placeholder="Why this defence applies on the facts of this article."
              maxLength={2400}
              className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-foreground placeholder:text-um-muted disabled:opacity-60"
            />
          </Field>
        </div>
      </div>

      {error ? (
        <div className="border-t border-border bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          {error}
        </div>
      ) : saved ? (
        <div className="border-t border-border bg-success/5 px-3 py-2 text-[11px] text-success">
          Saved.
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  field,
  missing,
  children,
}: {
  label: string;
  field: ReasonableStepsField;
  missing: ReasonableStepsField[];
  children: React.ReactNode;
}) {
  const isMissing = missing.includes(field);
  return (
    <label className="flex flex-col gap-1">
      <span
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.05em]",
          isMissing ? "text-warn" : "text-um-muted",
        )}
      >
        {label}
        {isMissing ? (
          <span className="ml-1">· missing</span>
        ) : null}
        {!isMissing && field === "defence" ? null : null}
        <span className="sr-only">
          {REASONABLE_STEPS_FIELD_LABELS[field]}
        </span>
      </span>
      {children}
    </label>
  );
}
