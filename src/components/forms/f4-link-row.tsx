"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Globe,
  Link2,
  RotateCcw,
  ShieldX,
  Trash2,
  X,
} from "lucide-react";
import {
  decideInterlink,
  deleteInterlink,
  resolveInterlink,
  updateInterlink,
  type InterlinkActionResult,
} from "@/lib/actions/interlinks";
import {
  B4_QUESTIONS,
  isBannedDomainUrl,
  isRecent,
  RECENCY_DAYS,
  RESOLUTION,
  type ArticleInterlinkRow,
  type LinkKind,
  type LinkResolution,
} from "@/lib/spec/f4-interlinks";
import { cn } from "@/lib/utils";

/**
 * One F4 candidate/placed/rejected row.
 *
 * Two display modes:
 *   - editing=true   — inline form (URL, anchor, paragraph, B4 yes/no for
 *                       internal, notes)
 *   - editing=false  — compact card with header + decision buttons + actions
 *
 * Actions:
 *   - Resolve URL (fires resolveInterlink → server fetch)
 *   - Place / Reject / Re-open
 *   - Save edits
 *   - Delete
 */

const labelCls =
  "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";
const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const textareaCls =
  "min-h-[60px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

const RES_TONE: Record<LinkResolution, string> = {
  unchecked: "border-border-mid bg-secondary text-fg-2",
  ok: "border-success/45 bg-success/10 text-success",
  redirect: "border-warn/45 bg-warn/10 text-warn",
  failed: "border-destructive/45 bg-destructive/10 text-destructive",
};

type Props = {
  articleId: string;
  row: ArticleInterlinkRow;
};

export function F4LinkRow({ articleId, row }: Props) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Editable mirror of the row.
  const [kind, setKind] = useState<LinkKind>(row.kind);
  const [targetUrl, setTargetUrl] = useState(row.target_url);
  const [targetTitle, setTargetTitle] = useState(row.target_title ?? "");
  const [targetPublishedAt, setTargetPublishedAt] = useState(
    row.target_published_at ?? "",
  );
  const [anchorText, setAnchorText] = useState(row.anchor_text ?? "");
  const [placement, setPlacement] = useState<string>(
    row.placement_paragraph !== null ? String(row.placement_paragraph) : "",
  );
  const [notes, setNotes] = useState(row.notes ?? "");
  const [b4, setB4] = useState<{
    b4_q1_useful_context: boolean | null;
    b4_q2_topically_related: boolean | null;
    b4_q3_anchor_descriptive: boolean | null;
  }>({
    b4_q1_useful_context: row.b4_q1_useful_context,
    b4_q2_topically_related: row.b4_q2_topically_related,
    b4_q3_anchor_descriptive: row.b4_q3_anchor_descriptive,
  });

  const showsBanned = isBannedDomainUrl(targetUrl);
  const recent = isRecent(row.target_published_at);

  function call(
    fn: (fd: FormData) => Promise<InterlinkActionResult>,
    fd: FormData,
    onOk?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const res = await fn(fd);
      if (!res.ok) setError(res.error);
      else if (onOk) onOk();
    });
  }

  function onSave() {
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("article_id", articleId);
    fd.set("kind", kind);
    fd.set("target_url", targetUrl);
    fd.set("target_title", targetTitle);
    fd.set("target_published_at", targetPublishedAt);
    fd.set("anchor_text", anchorText);
    fd.set("placement_paragraph", placement);
    fd.set("notes", notes);
    if (kind === "internal") {
      fd.set("b4_q1_useful_context", boolStr(b4.b4_q1_useful_context));
      fd.set("b4_q2_topically_related", boolStr(b4.b4_q2_topically_related));
      fd.set("b4_q3_anchor_descriptive", boolStr(b4.b4_q3_anchor_descriptive));
    }
    call(updateInterlink, fd, () => setEditing(false));
  }

  function onResolve() {
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("article_id", articleId);
    call(resolveInterlink, fd);
  }

  function onDecide(decision: "candidate" | "placed" | "rejected") {
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("article_id", articleId);
    fd.set("decision", decision);
    call(decideInterlink, fd);
  }

  function onDelete() {
    if (!window.confirm("Delete this interlink candidate?")) return;
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("article_id", articleId);
    call(deleteInterlink, fd);
  }

  const resTone = RES_TONE[row.resolution_status];
  const resLabel =
    RESOLUTION.find((r) => r.value === row.resolution_status)?.label ?? "—";

  const tone =
    row.decision === "placed"
      ? "border-success/40"
      : row.decision === "rejected"
        ? "border-destructive/40"
        : row.is_banned_domain
          ? "border-destructive/40"
          : "border-border";

  const KindIcon = row.kind === "internal" ? Link2 : Globe;

  return (
    <article className={cn("rounded-lg border bg-card p-3.5", tone)}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex w-[64px] flex-shrink-0 flex-col items-start gap-0.5">
          <span className="flex items-center gap-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.05em] text-foreground">
            <KindIcon className="h-3 w-3" />
            {row.kind === "internal" ? "INT" : "OUT"}
          </span>
          <span
            className={cn(
              "rounded-sm border px-1 text-[9px] font-bold uppercase tracking-[0.06em]",
              row.decision === "placed"
                ? "border-success/45 bg-success/10 text-success"
                : row.decision === "rejected"
                  ? "border-destructive/45 bg-destructive/10 text-destructive"
                  : "border-border-mid bg-secondary text-fg-2",
            )}
          >
            {row.decision === "candidate"
              ? "CAND"
              : row.decision === "placed"
                ? "PLACED"
                : "REJ"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-baseline gap-2">
            <h3 className="truncate text-[12.5px] font-semibold text-foreground">
              {row.target_title || row.target_url}
            </h3>
            {row.placement_paragraph ? (
              <span className="font-mono text-[10.5px] text-um-muted">
                ¶{row.placement_paragraph}
              </span>
            ) : null}
          </div>
          <a
            href={row.target_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-mono text-[10.5px] text-fg-2 hover:text-foreground hover:underline"
          >
            {row.target_url}
          </a>
          {row.anchor_text ? (
            <div className="mt-1 text-[11.5px] text-fg-2">
              Anchor:{" "}
              <span className="italic text-foreground">“{row.anchor_text}”</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
              resTone,
            )}
          >
            {resLabel}
            {row.http_status ? (
              <span className="ml-1 font-mono">· {row.http_status}</span>
            ) : null}
          </span>
          {row.is_banned_domain ? (
            <span className="rounded-md border border-destructive/45 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
              BANNED C7
            </span>
          ) : null}
          {row.kind === "internal" && row.target_published_at ? (
            <span
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                recent
                  ? "border-success/45 bg-success/10 text-success"
                  : "border-warn/45 bg-warn/10 text-warn",
              )}
            >
              {recent ? `≤ ${RECENCY_DAYS}d` : `> ${RECENCY_DAYS}d (E4)`}
            </span>
          ) : null}
        </div>
      </div>

      {/* B4 chips (internal, not editing) */}
      {!editing && row.kind === "internal" ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {B4_QUESTIONS.map((q) => {
            const val = row[q.key];
            return (
              <span
                key={q.key}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                  val === true
                    ? "border-success/45 bg-success/10 text-success"
                    : val === false
                      ? "border-destructive/45 bg-destructive/10 text-destructive"
                      : "border-border-mid bg-secondary text-um-muted",
                )}
                title={q.prompt}
              >
                B4·Q{q.number}{" "}
                {val === true ? "Y" : val === false ? "N" : "—"}
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Notes */}
      {!editing && row.notes ? (
        <p className="mt-2 text-[11.5px] leading-[1.5] text-fg-2">
          {row.notes}
        </p>
      ) : null}

      {/* Editing form */}
      {editing ? (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div>
            <label className={labelCls}>Kind</label>
            <div className="mt-1 flex gap-1">
              <KindBtn current={kind} value="internal" onClick={() => setKind("internal")} />
              <KindBtn current={kind} value="outbound" onClick={() => setKind("outbound")} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Target URL</label>
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className={cn(inputCls, "mt-1 font-mono text-[11.5px]")}
            />
            {showsBanned ? (
              <p className="mt-1 flex items-start gap-1 text-[10.5px] text-destructive">
                <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" />
                <span>
                  C7 banned domain (DIGIT / Futurescot / SFN). Will be marked
                  banned on save.
                </span>
              </p>
            ) : null}
          </div>

          <div>
            <label className={labelCls}>Target title</label>
            <input
              value={targetTitle}
              onChange={(e) => setTargetTitle(e.target.value)}
              className={cn(inputCls, "mt-1")}
              placeholder="Article headline / page title"
            />
          </div>

          <div>
            <label className={labelCls}>Target published date</label>
            <input
              type="date"
              value={targetPublishedAt}
              onChange={(e) => setTargetPublishedAt(e.target.value)}
              className={cn(inputCls, "mt-1 font-mono tabular-nums")}
            />
          </div>

          <div>
            <label className={labelCls}>Anchor text</label>
            <input
              value={anchorText}
              onChange={(e) => setAnchorText(e.target.value)}
              className={cn(inputCls, "mt-1")}
              placeholder="Natural prose; describes what the reader will find."
            />
          </div>

          <div>
            <label className={labelCls}>Placement paragraph</label>
            <input
              type="number"
              min={1}
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
              className={cn(inputCls, "mt-1 font-mono tabular-nums")}
              placeholder="1, 2, 3…"
            />
          </div>

          {/* B4 questions (internal only) */}
          {kind === "internal" ? (
            <div className="col-span-2 rounded-md border border-border bg-background p-2.5">
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                B4 placement test (all three must be YES to place)
              </div>
              <ul className="space-y-1.5">
                {B4_QUESTIONS.map((q) => (
                  <li key={q.key} className="flex items-start gap-2">
                    <span className="flex-shrink-0 pt-0.5 font-mono text-[10.5px] font-bold text-um-muted">
                      Q{q.number}
                    </span>
                    <span className="flex-1 text-[11.5px] leading-[1.45] text-foreground">
                      {q.prompt}
                    </span>
                    <div className="flex flex-shrink-0 gap-1">
                      <YesNoBtn
                        value={b4[q.key]}
                        target
                        onClick={(v) =>
                          setB4((prev) => ({ ...prev, [q.key]: v }))
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="col-span-2">
            <label className={labelCls}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={cn(textareaCls, "mt-1")}
              placeholder="Why this candidate matters. Recency note. Anchor variants tried."
              maxLength={1200}
            />
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10.5px] text-um-muted">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            <span className="font-mono tabular-nums">
              added{" "}
              {new Date(row.created_at).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              })}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={pending}
                className="h-7 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={pending}
                className="h-7 rounded-md border border-primary/45 bg-primary/15 px-3 text-[11px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
              >
                <Check className="mr-1 inline h-3 w-3" />
                Save
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onResolve}
                disabled={pending}
                className="h-7 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
              >
                <RotateCcw className="mr-1 inline h-3 w-3" />
                {row.resolution_status === "unchecked"
                  ? "Resolve URL"
                  : "Re-check"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={pending}
                className="h-7 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
              >
                Edit
              </button>
              {row.decision !== "placed" ? (
                <button
                  type="button"
                  onClick={() => onDecide("placed")}
                  disabled={pending}
                  className="h-7 rounded-md border border-success/45 bg-success/10 px-2.5 text-[11px] font-semibold text-success hover:bg-success/15 disabled:opacity-60"
                >
                  <CheckCircle2 className="mr-1 inline h-3 w-3" />
                  Place
                </button>
              ) : null}
              {row.decision !== "rejected" ? (
                <button
                  type="button"
                  onClick={() => onDecide("rejected")}
                  disabled={pending}
                  className="h-7 rounded-md border border-destructive/45 bg-destructive/10 px-2.5 text-[11px] font-semibold text-destructive hover:bg-destructive/15 disabled:opacity-60"
                >
                  <ShieldX className="mr-1 inline h-3 w-3" />
                  Reject
                </button>
              ) : null}
              {row.decision !== "candidate" ? (
                <button
                  type="button"
                  onClick={() => onDecide("candidate")}
                  disabled={pending}
                  className="h-7 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
                >
                  Re-open
                </button>
              ) : null}
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="h-7 rounded-md border border-border bg-background px-2 text-um-muted hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                title="Delete candidate"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function boolStr(v: boolean | null): string {
  return v === true ? "yes" : v === false ? "no" : "";
}

function KindBtn({
  current,
  value,
  onClick,
}: {
  current: LinkKind;
  value: LinkKind;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-[11.5px] font-semibold transition-colors",
        current === value
          ? "border-primary/45 bg-primary/10 text-primary"
          : "border-border bg-background text-fg-2 hover:bg-secondary",
      )}
    >
      {value === "internal" ? (
        <Link2 className="h-3.5 w-3.5" />
      ) : (
        <Globe className="h-3.5 w-3.5" />
      )}
      {value === "internal" ? "Internal" : "Outbound"}
    </button>
  );
}

function YesNoBtn({
  value,
  onClick,
}: {
  value: boolean | null;
  target?: true;
  onClick: (v: boolean | null) => void;
}) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => onClick(value === true ? null : true)}
        className={cn(
          "flex h-7 w-9 items-center justify-center rounded-md border text-[11px] font-bold transition-colors",
          value === true
            ? "border-success/45 bg-success/10 text-success"
            : "border-border bg-background text-fg-2 hover:bg-secondary",
        )}
        aria-label="Yes"
      >
        <Check className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => onClick(value === false ? null : false)}
        className={cn(
          "flex h-7 w-9 items-center justify-center rounded-md border text-[11px] font-bold transition-colors",
          value === false
            ? "border-destructive/45 bg-destructive/10 text-destructive"
            : "border-border bg-background text-fg-2 hover:bg-secondary",
        )}
        aria-label="No"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
