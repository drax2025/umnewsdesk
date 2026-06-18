"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileWarning,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  CORRECTION_KINDS,
  CORRECTION_STATUSES,
  defaultPublicNotice,
  type ArticleCorrectionRow,
  type CorrectionKind,
} from "@/lib/spec/stage13-corrections";
import {
  approveCorrection,
  deleteCorrection,
  fileCorrection,
  updateCorrection,
  withdrawCorrection,
  type CorrectionActionResult,
} from "@/lib/actions/corrections";
import { cn } from "@/lib/utils";

/**
 * Stage 13 — Corrections panel for the article dossier.
 *
 * Editors file drafts; seniors approve, withdraw, or hard-delete.
 * Approved corrections render the public notice + per-row stamp on the
 * reader-facing surface (markdown push and archive).
 */

export function CorrectionsPanel({
  articleId,
  rows,
  canEdit,
  canSenior,
}: {
  articleId: string;
  rows: ArticleCorrectionRow[];
  canEdit: boolean;
  canSenior: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-baseline gap-2 border-b border-border bg-background/40 px-3 py-2">
        <FileWarning className="h-3.5 w-3.5 text-warn" />
        <h2 className="text-[12.5px] font-semibold text-foreground">
          Corrections register · Stage 13
        </h2>
        <span className="text-[10.5px] text-um-muted">
          {rows.length === 0
            ? "No corrections filed."
            : `${rows.length} entr${rows.length === 1 ? "y" : "ies"} · ${rows.filter((r) => r.status === "approved").length} live`}
        </span>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto flex h-7 items-center gap-1 rounded-md border border-warn/40 bg-warn/10 px-2.5 text-[11px] font-semibold text-warn hover:bg-warn/15"
          >
            <Plus className="h-3 w-3" />
            File correction
          </button>
        ) : null}
      </header>

      {adding ? (
        <FileForm
          articleId={articleId}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11.5px] text-um-muted">
          Once an article publishes, factual fixes, clarifications, and
          updates are filed here. Editors file drafts; Admin
          approves.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <CorrectionRow
              key={r.id}
              row={r}
              canEdit={canEdit}
              canSenior={canSenior}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CorrectionRow({
  row,
  canEdit,
  canSenior,
}: {
  row: ArticleCorrectionRow;
  canEdit: boolean;
  canSenior: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const kindDef = CORRECTION_KINDS.find((k) => k.value === row.kind)!;
  const statusDef = CORRECTION_STATUSES.find((s) => s.value === row.status)!;

  function approve() {
    setError(null);
    const fd = new FormData();
    fd.set("id", row.id);
    startTransition(async () => {
      const res: CorrectionActionResult = await approveCorrection(fd);
      if (!res.ok) setError(res.error);
    });
  }

  function withdraw() {
    setError(null);
    if (!withdrawReason.trim()) {
      setError("Withdrawal needs a reason for the audit trail.");
      return;
    }
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("reason", withdrawReason);
    startTransition(async () => {
      const res: CorrectionActionResult = await withdrawCorrection(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setWithdrawing(false);
    });
  }

  function hardDelete() {
    if (!confirm("Hard-delete this correction row? This bypasses the audit trail.")) {
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("id", row.id);
    startTransition(async () => {
      const res: CorrectionActionResult = await deleteCorrection(fd);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className={cn(
            "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.05em]",
            kindDef.tone === "destructive"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : kindDef.tone === "warn"
                ? "border-warn/40 bg-warn/10 text-warn"
                : "border-border bg-secondary text-um-muted",
          )}
        >
          {kindDef.short} #{row.sequence}
        </span>
        <span
          className={cn(
            "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.05em]",
            statusDef.tone === "success"
              ? "border-success/40 bg-success/10 text-success"
              : statusDef.tone === "warn"
                ? "border-warn/40 bg-warn/10 text-warn"
                : "border-border bg-secondary text-um-muted",
          )}
        >
          {statusDef.short}
        </span>
        <span className="text-[12px] font-medium text-foreground">
          {kindDef.label}
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-um-muted">
          filed {new Date(row.filed_at).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex h-6 w-6 items-center justify-center rounded-sm border border-border bg-background text-um-muted hover:bg-secondary"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      </div>

      <p className="text-[11.5px] leading-[1.5] text-fg-2">
        {row.description}
      </p>

      {open ? (
        <div className="space-y-2 rounded-md border border-border bg-background/40 px-2.5 py-2 text-[11.5px] leading-[1.5]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
              Public notice
            </p>
            <p className="text-foreground">{row.public_notice}</p>
          </div>
          {row.source ? (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
                Source
              </p>
              <p className="text-fg-2">{row.source}</p>
            </div>
          ) : null}
          {Object.keys(row.fields_changed ?? {}).length > 0 ? (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
                Fields changed
              </p>
              <ul className="space-y-1">
                {Object.entries(row.fields_changed).map(([field, diff]) => (
                  <li
                    key={field}
                    className="rounded-sm border border-border bg-background/50 px-2 py-1"
                  >
                    <span className="font-mono text-[10.5px] text-primary">
                      {field}
                    </span>
                    {diff.before ? (
                      <p className="line-through text-um-muted">{diff.before}</p>
                    ) : null}
                    {diff.after ? (
                      <p className="text-foreground">{diff.after}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {row.approved_at ? (
            <p className="font-mono text-[10.5px] text-success">
              approved {new Date(row.approved_at).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          ) : null}
          {row.withdrawn_at ? (
            <div>
              <p className="font-mono text-[10.5px] text-um-muted">
                withdrawn {new Date(row.withdrawn_at).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              {row.withdrawn_reason ? (
                <p className="text-[11px] italic text-fg-2">
                  “{row.withdrawn_reason}”
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <FileForm
          articleId={row.article_id}
          existing={row}
          onClose={() => setEditing(false)}
        />
      ) : null}

      {withdrawing ? (
        <div className="space-y-1.5 rounded-md border border-warn/40 bg-warn/5 px-2.5 py-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-warn">
            Withdraw correction
          </p>
          <textarea
            value={withdrawReason}
            onChange={(e) => setWithdrawReason(e.target.value)}
            rows={2}
            placeholder="Why is this being pulled? (audit trail)"
            maxLength={1200}
            className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-[11.5px] text-foreground focus:border-primary/40 focus:outline-none"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={withdraw}
              disabled={pending}
              className="flex h-6 items-center gap-1 rounded-md border border-warn/45 bg-warn/10 px-2 text-[11px] text-warn hover:bg-warn/15 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Confirm withdraw
            </button>
            <button
              type="button"
              onClick={() => setWithdrawing(false)}
              className="h-6 rounded-md border border-border bg-background px-2 text-[11px] text-fg-2 hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {canEdit && row.status === "draft" ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] text-fg-2 hover:bg-secondary"
          >
            <Edit3 className="h-3 w-3" />
            Edit
          </button>
        ) : null}
        {canSenior && row.status === "draft" ? (
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="flex h-6 items-center gap-1 rounded-md border border-success/45 bg-success/10 px-2 text-[11px] text-success hover:bg-success/15 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Approve
          </button>
        ) : null}
        {canSenior && row.status !== "withdrawn" ? (
          <button
            type="button"
            onClick={() => setWithdrawing(true)}
            className="flex h-6 items-center gap-1 rounded-md border border-warn/40 bg-warn/10 px-2 text-[11px] text-warn hover:bg-warn/15"
          >
            <X className="h-3 w-3" />
            Withdraw
          </button>
        ) : null}
        {canSenior ? (
          <button
            type="button"
            onClick={hardDelete}
            disabled={pending}
            className="ml-auto flex h-6 items-center gap-1 rounded-md border border-destructive/35 bg-destructive/10 px-2 text-[11px] text-destructive hover:bg-destructive/15 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      ) : null}
    </li>
  );
}

function FileForm({
  articleId,
  existing,
  onClose,
}: {
  articleId: string;
  existing?: ArticleCorrectionRow;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<CorrectionKind>(
    existing?.kind ?? "correction",
  );
  const [description, setDescription] = useState(existing?.description ?? "");
  const [source, setSource] = useState(existing?.source ?? "");
  const [publicNotice, setPublicNotice] = useState(
    existing?.public_notice ?? defaultPublicNotice("correction"),
  );
  const [noticeDirty, setNoticeDirty] = useState(Boolean(existing));
  const [fieldsJson, setFieldsJson] = useState(
    existing
      ? JSON.stringify(existing.fields_changed ?? {}, null, 2)
      : "",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setKindAndNotice(next: CorrectionKind) {
    setKind(next);
    if (!noticeDirty) setPublicNotice(defaultPublicNotice(next));
  }

  function submit() {
    setError(null);
    const fd = new FormData();
    if (existing) fd.set("id", existing.id);
    fd.set("article_id", articleId);
    fd.set("kind", kind);
    fd.set("description", description);
    fd.set("source", source);
    fd.set("public_notice", publicNotice);
    fd.set("fields_changed", fieldsJson);
    startTransition(async () => {
      const res: CorrectionActionResult = existing
        ? await updateCorrection(fd)
        : await fileCorrection(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="space-y-2 rounded-md border border-warn/30 bg-warn/5 px-3 py-3">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-warn">
          {existing ? `Edit #${existing.sequence}` : "File correction"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm p-1 text-um-muted hover:bg-secondary"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
            Kind *
          </label>
          <select
            value={kind}
            onChange={(e) => setKindAndNotice(e.target.value as CorrectionKind)}
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
          >
            {CORRECTION_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label} — {k.description}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
            Source / who flagged it
          </label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. Subject contacted us; reader report"
            maxLength={1200}
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Description (internal) *
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What was wrong, what was fixed, evidence."
          maxLength={4000}
          className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.45] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Public notice (appears under byline)
        </label>
        <textarea
          value={publicNotice}
          onChange={(e) => {
            setPublicNotice(e.target.value);
            setNoticeDirty(true);
          }}
          rows={3}
          maxLength={2400}
          className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.45] text-foreground focus:border-primary/40 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Fields changed (JSON map of field → before/after, optional)
        </label>
        <textarea
          value={fieldsJson}
          onChange={(e) => setFieldsJson(e.target.value)}
          rows={4}
          placeholder={'{ "headline": { "before": "...", "after": "..." } }'}
          maxLength={8000}
          className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[11.5px] leading-[1.45] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
        />
      </div>

      {error ? (
        <div className="flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11.5px] text-destructive">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="h-8 rounded-md border border-border bg-background px-3 text-[11.5px] text-fg-2 hover:bg-secondary disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="flex h-8 items-center gap-1.5 rounded-md border border-warn/45 bg-warn/10 px-3 text-[11.5px] font-semibold text-warn hover:bg-warn/15 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          {existing ? "Save changes" : "File draft"}
        </button>
      </div>
    </div>
  );
}
