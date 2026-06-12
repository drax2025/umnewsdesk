"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Save,
  ShieldX,
  XCircle,
} from "lucide-react";
import {
  STANDING_RULES,
  STANDING_RULE_STATUS,
  statusForRule,
  justificationForRule,
  summariseStandingRules,
  type ArticleStandingRuleSweepRow,
  type StandingRuleDef,
  type StandingRuleStatus,
} from "@/lib/spec/f9-standing-rule";
import {
  saveStandingRule,
  type PrePublishActionResult,
} from "@/lib/actions/pre-publish";
import { cn } from "@/lib/utils";

/**
 * F9 Pack section 10 — Standing-Rule Compliance.
 *
 * Renders nine rows (B1-B7 + Section M + Section L). Each row:
 *   - Status pills (PENDING / PASS / FAIL / N/A).
 *   - Justification textarea (required for FAIL or N/A).
 *   - B2 also exposes an "artefacts swept" field — which of the 17 prohibited
 *     artefacts F9 actually checked.
 *
 * Roll-up bar at the top mirrors pack-language for the standing-rule section.
 */

const STATUS_ICON: Record<StandingRuleStatus, React.ComponentType<{ className?: string }>> = {
  pending: CircleDashed,
  checked_pass: CheckCircle2,
  checked_fail: XCircle,
  na: ShieldX,
};

type Props = {
  articleId: string;
  row: ArticleStandingRuleSweepRow | null;
  readOnly?: boolean;
};

export function StandingRuleSweep({ articleId, row, readOnly = false }: Props) {
  const summary = summariseStandingRules(row);

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-background/40 px-3 py-2">
        <Check className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          Standing-Rule Compliance · pack section 10
        </h2>
        <span className="ml-auto font-mono text-[10.5px] text-um-muted">
          {summary.pass} pass · {summary.fail} fail · {summary.na} N/A ·{" "}
          {summary.pending} pending
        </span>
        {summary.complete ? (
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
      </header>

      <p className="border-b border-border bg-background/30 px-3 py-2 text-[10.5px] leading-[1.5] text-um-muted">
        F9 cannot return PASS without every row CHECKED-PASS, CHECKED-FAIL or
        N/A-with-justification. A pending row, or N/A without justification,
        leaves the pack <strong>INCOMPLETE</strong> and routes the article back
        to F9.
      </p>

      <div className="divide-y divide-border">
        {STANDING_RULES.map((def) => (
          <StandingRuleRow
            key={def.code}
            articleId={articleId}
            def={def}
            initialStatus={statusForRule(row, def.code)}
            initialJustification={justificationForRule(row, def.code)}
            initialArtefactsSwept={def.hasArtefactsSwept ? row?.b2_artefacts_swept ?? null : null}
            readOnly={readOnly}
          />
        ))}
      </div>
    </section>
  );
}

function StandingRuleRow({
  articleId,
  def,
  initialStatus,
  initialJustification,
  initialArtefactsSwept,
  readOnly,
}: {
  articleId: string;
  def: StandingRuleDef;
  initialStatus: StandingRuleStatus;
  initialJustification: string | null;
  initialArtefactsSwept: string | null;
  readOnly: boolean;
}) {
  const [status, setStatus] = useState<StandingRuleStatus>(initialStatus);
  const [justification, setJustification] = useState<string>(
    initialJustification ?? "",
  );
  const [artefacts, setArtefacts] = useState<string>(
    initialArtefactsSwept ?? "",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);

  const needsJustification =
    (status === "checked_fail" || status === "na") &&
    justification.trim().length === 0;

  function save() {
    if (readOnly) return;
    setError(null);
    if (needsJustification) {
      setError(
        status === "checked_fail"
          ? "Checked-fail rows require a justification."
          : "N/A rows require a justification.",
      );
      return;
    }
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("code", def.code);
    fd.set("status", status);
    fd.set("justification", justification);
    if (def.hasArtefactsSwept) fd.set("artefacts_swept", artefacts);

    startTransition(async () => {
      const res: PrePublishActionResult = await saveStandingRule(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-2">
          {def.code === "section_m"
            ? "Section M"
            : def.code === "section_l"
              ? "Section L"
              : def.code}
        </span>
        <span className="text-[12.5px] font-medium text-foreground">
          {def.label.replace(/^B[1-9]\s—\s/, "").replace(/^Section [ML]\s—\s/, "")}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {saved ? (
            <span className="flex items-center gap-1 font-mono text-[10px] text-success">
              <CheckCircle2 className="h-3 w-3" />
              saved
            </span>
          ) : null}
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
              Save row
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-[10.5px] leading-[1.45] text-um-muted">{def.description}</p>

      <div className="flex flex-wrap gap-1">
        {STANDING_RULE_STATUS.map((s) => {
          const Icon = STATUS_ICON[s.value];
          const active = status === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => {
                setStatus(s.value);
                setError(null);
              }}
              disabled={readOnly || pending}
              className={cn(
                "flex h-7 items-center gap-1 rounded-md border px-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] transition-colors disabled:opacity-50",
                active
                  ? s.tone === "success"
                    ? "border-success/45 bg-success/10 text-success"
                    : s.tone === "destructive"
                      ? "border-destructive/45 bg-destructive/10 text-destructive"
                      : s.tone === "warn"
                        ? "border-warn/45 bg-warn/10 text-warn"
                        : "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-fg-2 hover:bg-secondary",
              )}
            >
              <Icon className="h-3 w-3" />
              {s.short}
            </button>
          );
        })}
      </div>

      <textarea
        rows={2}
        value={justification}
        onChange={(e) => {
          setJustification(e.target.value);
          setError(null);
        }}
        disabled={readOnly || pending}
        placeholder={
          status === "checked_fail"
            ? "Record the failure — what's broken? (required)"
            : status === "na"
              ? "Why is this rule not applicable? (required)"
              : "Optional one-line note — surfaces in pack section 10."
        }
        maxLength={2400}
        className={cn(
          "w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-foreground placeholder:text-um-muted disabled:opacity-60",
          needsJustification ? "border-destructive/40" : "border-border",
        )}
      />

      {def.hasArtefactsSwept ? (
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
            Artefacts swept · which of the 17 prohibited types F9 actually checked
          </span>
          <textarea
            rows={2}
            value={artefacts}
            onChange={(e) => setArtefacts(e.target.value)}
            disabled={readOnly || pending}
            placeholder="e.g. DIGIT headline · DIGIT body · Futurescot tweet · SFN newsletter…"
            maxLength={2400}
            className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] leading-[1.45] text-foreground placeholder:text-um-muted disabled:opacity-60"
          />
        </label>
      ) : null}

      {error ? (
        <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
