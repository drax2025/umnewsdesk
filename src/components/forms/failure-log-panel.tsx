"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import {
  FAILURE_LOG_EVENTS,
  FAILURE_LOG_STAGES,
  cleanRunDeclaration,
  eventLabel,
  eventShort,
  eventTone,
  stageLabel,
  summariseFailureLog,
  type ArticleFailureLogRow,
  type FailureLogEvent,
  type FailureLogStage,
} from "@/lib/spec/failure-log";
import {
  appendFailureEvent,
  deleteFailureEvent,
  type FailureLogActionResult,
} from "@/lib/actions/failure-log";
import { cn } from "@/lib/utils";

/**
 * Pack section 0 — Article Failure Log panel.
 *
 * Top: clean-run declaration + roll-up by stage.
 * Middle: chronological row list (newest first).
 * Bottom: inline append form.
 *
 * Visible to editor + senior_editor; SK-OPS override toggle additionally
 * surfaces the override-reason field.
 */

type Props = {
  articleId: string;
  rows: ArticleFailureLogRow[];
  readOnly?: boolean;
};

const TONE_CLASS: Record<
  "destructive" | "warn" | "muted" | "info",
  { pill: string; bg: string }
> = {
  destructive: {
    pill: "border-destructive/45 bg-destructive/10 text-destructive",
    bg: "bg-destructive/4",
  },
  warn: {
    pill: "border-warn/45 bg-warn/10 text-warn",
    bg: "bg-warn/4",
  },
  info: {
    pill: "border-primary/40 bg-primary/10 text-primary",
    bg: "bg-primary/4",
  },
  muted: {
    pill: "border-um-muted/40 bg-um-muted/10 text-um-muted",
    bg: "bg-background",
  },
};

function fmtAbs(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function FailureLogPanel({ articleId, rows, readOnly = false }: Props) {
  const summary = useMemo(() => summariseFailureLog(rows), [rows]);
  const declaration = useMemo(() => cleanRunDeclaration(rows), [rows]);

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-background/40 px-3 py-2">
        <ListChecks className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          Failure Log · pack section 0
        </h2>
        <span className="ml-auto font-mono text-[10.5px] text-um-muted">
          {summary.total} event{summary.total === 1 ? "" : "s"}
          {summary.overrideCount > 0
            ? ` · ${summary.overrideCount} override${summary.overrideCount === 1 ? "" : "s"}`
            : ""}
        </span>
        {summary.cleanRun ? (
          <span className="flex items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-success">
            <CheckCircle2 className="h-3 w-3" />
            clean run
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-warn">
            <AlertTriangle className="h-3 w-3" />
            entries on file
          </span>
        )}
      </header>

      <p className="border-b border-border bg-background/30 px-3 py-2 text-[10.5px] leading-[1.5] text-um-muted">
        {declaration} Cross-agent chronological record — read BEFORE article
        content in the pack.
      </p>

      {rows.length > 0 ? (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <FailureRow
              key={r.id}
              row={r}
              articleId={articleId}
              readOnly={readOnly}
            />
          ))}
        </ul>
      ) : (
        <div className="border-b border-border px-3 py-4 text-center text-[11.5px] italic text-um-muted">
          No failure events recorded.
        </div>
      )}

      {!readOnly ? <AppendForm articleId={articleId} /> : null}
    </section>
  );
}

function FailureRow({
  row,
  articleId,
  readOnly,
}: {
  row: ArticleFailureLogRow;
  articleId: string;
  readOnly: boolean;
}) {
  const tone = eventTone(row.event);
  const cls = TONE_CLASS[tone];
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function drop() {
    if (readOnly) return;
    if (!confirm("Delete this Failure Log row? The pack will revalidate.")) return;
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("article_id", articleId);
    startTransition(async () => {
      const res: FailureLogActionResult = await deleteFailureEvent(fd);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <li className={cn("px-3 py-2.5 text-[11.5px] leading-[1.5]", cls.bg)}>
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10.5px] font-semibold tabular-nums text-fg-2">
          {row.stage}
        </span>
        <span
          className={cn(
            "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em]",
            cls.pill,
          )}
        >
          {eventShort(row.event)}
        </span>
        {row.gate_code ? (
          <span className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-2">
            {row.gate_code}
          </span>
        ) : null}
        {row.override_applied ? (
          <span className="rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-destructive">
            SK-OPS override
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[10px] text-um-muted">
          {fmtAbs(row.created_at)}
        </span>
        {!readOnly ? (
          <button
            type="button"
            onClick={drop}
            disabled={pending}
            className="flex h-6 items-center gap-1 rounded-sm border border-border bg-background px-1.5 text-[10.5px] text-um-muted hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            title="Delete row"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </button>
        ) : null}
      </div>
      <div className="text-[11.5px] text-foreground">{row.detail}</div>
      {row.remediation ? (
        <div className="mt-1 text-[10.5px] text-fg-2">
          <span className="font-mono uppercase tracking-[0.05em] text-um-muted">
            remediation ·
          </span>{" "}
          {row.remediation}
        </div>
      ) : null}
      {row.override_applied && row.override_reason ? (
        <div className="mt-1 text-[10.5px] text-destructive">
          <span className="font-mono uppercase tracking-[0.05em]">
            override ·
          </span>{" "}
          {row.override_reason}
        </div>
      ) : null}
      {error ? (
        <div className="mt-1 text-[10.5px] text-destructive">{error}</div>
      ) : null}
    </li>
  );
}

function AppendForm({ articleId }: { articleId: string }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<FailureLogStage>("F9");
  const [event, setEvent] = useState<FailureLogEvent>("other");
  const [gateCode, setGateCode] = useState<string>("");
  const [detail, setDetail] = useState<string>("");
  const [remediation, setRemediation] = useState<string>("");
  const [override, setOverride] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStage("F9");
    setEvent("other");
    setGateCode("");
    setDetail("");
    setRemediation("");
    setOverride(false);
    setOverrideReason("");
    setError(null);
  }

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("stage", stage);
    fd.set("event", event);
    fd.set("gate_code", gateCode);
    fd.set("detail", detail);
    fd.set("remediation", remediation);
    fd.set("override_applied", override ? "true" : "false");
    fd.set("override_reason", overrideReason);

    startTransition(async () => {
      const res: FailureLogActionResult = await appendFailureEvent(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reset();
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-7 items-center gap-1 rounded-sm border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary"
        >
          <Plus className="h-3 w-3" />
          Append Failure Log row
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-border bg-background/40 px-3 py-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
            Stage
          </span>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as FailureLogStage)}
            disabled={pending}
            className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
          >
            {FAILURE_LOG_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {stageLabel(s.value)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
            Event
          </span>
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value as FailureLogEvent)}
            disabled={pending}
            className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
          >
            {FAILURE_LOG_EVENTS.map((e) => (
              <option key={e.value} value={e.value}>
                {eventLabel(e.value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
          Gate code (optional) · e.g. H1, A4
        </span>
        <input
          type="text"
          value={gateCode}
          onChange={(e) => setGateCode(e.target.value)}
          disabled={pending}
          maxLength={24}
          className="h-8 rounded-md border border-border bg-background px-2 font-mono text-[11.5px] text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
          Detail · what happened (required)
        </span>
        <textarea
          rows={2}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          disabled={pending}
          maxLength={2400}
          className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
          Remediation (optional)
        </span>
        <textarea
          rows={2}
          value={remediation}
          onChange={(e) => setRemediation(e.target.value)}
          disabled={pending}
          maxLength={2400}
          className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-foreground"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-fg-2">
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
            disabled={pending}
          />
          SK-OPS override applied
        </label>
        {override ? (
          <input
            type="text"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            disabled={pending}
            placeholder="Override reason"
            maxLength={2400}
            className="h-7 flex-1 rounded-md border border-destructive/40 bg-background px-2 text-[11.5px] text-foreground"
          />
        ) : null}
      </div>

      {error ? (
        <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="flex h-7 items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Append row
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={pending}
          className="h-7 rounded-sm border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
