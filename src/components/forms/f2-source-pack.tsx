"use client";

import { useRef, useState, useTransition } from "react";
import {
  ExternalLink,
  FileText,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import {
  addSource,
  deleteSource,
  updateSource,
  type ResearchActionResult,
} from "@/lib/actions/research";
import {
  isSignalOnlyUrl,
  MAX_CONTEXT_SOURCES,
  SOURCE_KINDS,
  type ArticleSourceRow,
  type SourceKind,
} from "@/lib/spec/f2-research";
import { cn } from "@/lib/utils";

/**
 * F2 Source Pack section.
 *
 * Spec F2 step 1-5 + B2 + B6.
 *
 * - Primary identification (press release, official statement, paper, filing)
 * - Independent confirmation (2 required for D-Tier 2 controversial)
 * - Tier 2 right-of-reply (subject response)
 * - Framing context (≤ 4)
 * - B2 signal-only outlet flag — DIGIT / Futurescot / SFN auto-tagged via URL
 *   host and rendered with a destructive "SIGNAL-ONLY" badge. These sources
 *   are pointers only — never the drafting basis.
 */

const KIND_TONE: Record<SourceKind, string> = {
  primary: "border-success/40 bg-success/10 text-success",
  independent: "border-primary/40 bg-primary/12 text-primary",
  subject_response: "border-warn/40 bg-warn/12 text-warn",
  context: "border-border-mid bg-secondary text-fg-2",
};

const KIND_SHORT: Record<SourceKind, string> = {
  primary: "PRIMARY",
  independent: "INDEPENDENT",
  subject_response: "RIGHT-OF-REPLY",
  context: "CONTEXT",
};

type Props = {
  articleId: string;
  sources: ArticleSourceRow[];
};

export function F2SourcePack({ articleId, sources }: Props) {
  const addRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<ArticleSourceRow | null>(null);

  const grouped: Record<SourceKind, ArticleSourceRow[]> = {
    primary: [],
    independent: [],
    subject_response: [],
    context: [],
  };
  for (const s of sources) grouped[s.kind].push(s);

  const contextCount = grouped.context.length;

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[12.5px] font-semibold text-foreground">
            F2 · Source pack
          </h2>
          <span className="text-[10.5px] text-um-muted">
            Primary → independent confirmation → Tier 2 reply → ≤ {MAX_CONTEXT_SOURCES} context
          </span>
        </div>
        <button
          type="button"
          onClick={() => addRef.current?.showModal()}
          className="flex h-7 items-center gap-1.5 rounded-md border border-primary/45 bg-primary/12 px-2.5 text-[11.5px] font-semibold text-primary hover:bg-primary/20"
        >
          <Plus className="h-3.5 w-3.5" />
          Add source
        </button>
      </header>

      <div className="divide-y divide-border">
        {SOURCE_KINDS.map((k) => (
          <KindBlock
            key={k.value}
            kind={k.value}
            label={k.label}
            hint={k.hint}
            rows={grouped[k.value]}
            onEdit={(row) => {
              setEditing(row);
              editRef.current?.showModal();
            }}
            articleId={articleId}
            contextCount={contextCount}
          />
        ))}
      </div>

      <SourceDialog
        ref={addRef}
        articleId={articleId}
        contextCount={contextCount}
        onDone={() => addRef.current?.close()}
      />
      {editing ? (
        <SourceDialog
          key={editing.id}
          ref={editRef}
          articleId={articleId}
          contextCount={contextCount}
          existing={editing}
          onDone={() => {
            editRef.current?.close();
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Kind block                                                                */
/* -------------------------------------------------------------------------- */

function KindBlock({
  kind,
  label,
  hint,
  rows,
  onEdit,
  articleId,
  contextCount,
}: {
  kind: SourceKind;
  label: string;
  hint: string;
  rows: ArticleSourceRow[];
  onEdit: (row: ArticleSourceRow) => void;
  articleId: string;
  contextCount: number;
}) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em]",
              KIND_TONE[kind],
            )}
          >
            {KIND_SHORT[kind]}
          </span>
          <span className="text-[10.5px] text-um-muted">{hint}</span>
        </div>
        {kind === "context" ? (
          <span
            className={cn(
              "font-mono text-[10.5px] tabular-nums",
              contextCount > MAX_CONTEXT_SOURCES
                ? "text-destructive"
                : "text-um-muted",
            )}
          >
            {contextCount} / {MAX_CONTEXT_SOURCES}
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-[11.5px] italic text-um-muted">
          No {label.toLowerCase()} sources yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <SourceRow
              key={r.id}
              row={r}
              onEdit={() => onEdit(r)}
              articleId={articleId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceRow({
  row,
  onEdit,
  articleId,
}: {
  row: ArticleSourceRow;
  onEdit: () => void;
  articleId: string;
}) {
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm("Remove this source?")) return;
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("article_id", articleId);
    startTransition(async () => {
      await deleteSource(fd);
    });
  }

  return (
    <li className="group flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-2">
      <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-um-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="truncate text-left text-[12px] font-medium text-foreground hover:text-primary"
            title={row.title ?? row.url}
          >
            {row.title ?? row.url}
          </button>
          {row.is_signal_only ? (
            <span
              className="flex flex-shrink-0 items-center gap-0.5 rounded-sm border border-destructive/45 bg-destructive/10 px-1 text-[9.5px] font-bold uppercase tracking-[0.05em] text-destructive"
              title="B2 signal-only outlet. Pointer use only — never drafting basis."
            >
              <ShieldAlert className="h-2.5 w-2.5" />
              SIGNAL-ONLY
            </span>
          ) : null}
          {row.is_paywalled ? (
            <span className="flex-shrink-0 rounded-sm border border-warn/45 bg-warn/10 px-1 text-[9.5px] font-bold uppercase tracking-[0.05em] text-warn">
              PAYWALL
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-um-muted">
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-[260px] items-center gap-0.5 truncate font-mono hover:text-fg-2"
          >
            <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
            {hostname(row.url)}
          </a>
          {row.publisher ? (
            <>
              <span>·</span>
              <span>{row.publisher}</span>
            </>
          ) : null}
          {row.author ? (
            <>
              <span>·</span>
              <span>{row.author}</span>
            </>
          ) : null}
          {row.published_at ? (
            <>
              <span>·</span>
              <span className="font-mono tabular-nums">
                {row.published_at.slice(0, 10)}
              </span>
            </>
          ) : null}
        </div>
        {row.notes ? (
          <p className="mt-1 text-[11px] leading-[1.4] text-fg-2">{row.notes}</p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={remove}
        className="opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-30"
        title="Remove source"
      >
        <Trash2 className="h-3.5 w-3.5 text-um-muted hover:text-destructive" />
      </button>
    </li>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* -------------------------------------------------------------------------- */
/*  Modal                                                                     */
/* -------------------------------------------------------------------------- */

const labelCls =
  "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";
const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const textareaCls =
  "min-h-[80px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[11.5px] leading-[1.45] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

function SourceDialog({
  ref,
  articleId,
  contextCount,
  existing,
  onDone,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  articleId: string;
  contextCount: number;
  existing?: ArticleSourceRow;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<SourceKind>(existing?.kind ?? "primary");
  const [url, setUrl] = useState<string>(existing?.url ?? "");
  const [signalManual, setSignalManual] = useState<boolean>(
    existing?.is_signal_only ?? false,
  );
  const [paywalled, setPaywalled] = useState<boolean>(
    existing?.is_paywalled ?? false,
  );
  const autoSignal = isSignalOnlyUrl(url);
  const showSignal = autoSignal || signalManual;

  const contextFull =
    kind === "context" &&
    !existing &&
    contextCount >= MAX_CONTEXT_SOURCES;

  function submit(fd: FormData) {
    setError(null);
    fd.set("article_id", articleId);
    fd.set("kind", kind);
    fd.set("url", url);
    fd.set("is_signal_only", signalManual ? "1" : "");
    fd.set("is_paywalled", paywalled ? "1" : "");

    startTransition(async () => {
      const res: ResearchActionResult = existing
        ? await (async () => {
            fd.set("id", existing.id);
            return updateSource(fd);
          })()
        : await addSource(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <dialog
      ref={ref}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="fixed inset-0 m-auto h-fit max-h-[92vh] w-[640px] max-w-[94vw] overflow-y-auto rounded-lg border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/40 backdrop:backdrop-blur-sm"
    >
      <div
        className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[13px] font-semibold text-foreground">
          {existing ? "Edit source" : "Add source"}
        </h3>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-um-muted hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <form
        action={submit}
        className="flex flex-col gap-3.5 px-4 py-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Kind picker */}
        <div>
          <label className={labelCls}>Source kind</label>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {SOURCE_KINDS.map((k) => (
              <button
                type="button"
                key={k.value}
                onClick={() => setKind(k.value)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-left transition-colors",
                  kind === k.value
                    ? KIND_TONE[k.value]
                    : "border-border bg-background text-fg-2 hover:bg-secondary",
                )}
              >
                <div className="text-[11.5px] font-semibold">{k.label}</div>
                <div className="mt-0.5 text-[10px] text-um-muted">{k.hint}</div>
              </button>
            ))}
          </div>
          {contextFull ? (
            <p className="mt-1.5 text-[10.5px] text-destructive">
              Context limit reached ({MAX_CONTEXT_SOURCES}).
              Edit existing context sources or pick another kind.
            </p>
          ) : null}
        </div>

        {/* URL + signal-only auto-tag */}
        <div>
          <label className={labelCls} htmlFor="src-url">
            URL
          </label>
          <input
            id="src-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            className={cn(inputCls, "mt-1 font-mono text-[11.5px]")}
          />
          {showSignal ? (
            <div className="mt-1.5 flex items-start gap-1.5 rounded-sm border border-destructive/35 bg-destructive/10 px-2 py-1 text-[10.5px] text-destructive">
              <ShieldAlert className="h-3 w-3 flex-shrink-0" />
              <span>
                B2 signal-only outlet. May be referenced as a pointer to a
                story, never as the drafting basis.
                {autoSignal ? " (auto-detected from host)" : null}
              </span>
            </div>
          ) : null}
        </div>

        {/* Title / Publisher / Author / Published */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={labelCls} htmlFor="src-title">
              Title
            </label>
            <input
              id="src-title"
              name="title"
              defaultValue={existing?.title ?? ""}
              className={cn(inputCls, "mt-1")}
              maxLength={500}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="src-publisher">
              Publisher
            </label>
            <input
              id="src-publisher"
              name="publisher"
              defaultValue={existing?.publisher ?? ""}
              className={cn(inputCls, "mt-1")}
              maxLength={240}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="src-author">
              Author
            </label>
            <input
              id="src-author"
              name="author"
              defaultValue={existing?.author ?? ""}
              className={cn(inputCls, "mt-1")}
              maxLength={240}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="src-published">
              Published
            </label>
            <input
              id="src-published"
              type="date"
              name="published_at"
              defaultValue={existing?.published_at?.slice(0, 10) ?? ""}
              className={cn(inputCls, "mt-1")}
            />
          </div>
        </div>

        {/* Content */}
        <div>
          <label className={labelCls} htmlFor="src-content">
            Source content (Unicode preserved — B1 verbatim substrate)
          </label>
          <textarea
            id="src-content"
            name="content"
            defaultValue={existing?.content ?? ""}
            placeholder="Paste the source text. Keep original Unicode codepoints (incl. U+2010 / U+2011 hyphen variants)."
            className={cn(textareaCls, "mt-1")}
            maxLength={200_000}
          />
        </div>

        {/* Flags */}
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-1.5 text-[11.5px] text-fg-2">
            <input
              type="checkbox"
              checked={signalManual}
              onChange={(e) => setSignalManual(e.target.checked)}
            />
            Mark as signal-only (B2)
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px] text-fg-2">
            <input
              type="checkbox"
              checked={paywalled}
              onChange={(e) => setPaywalled(e.target.checked)}
            />
            Paywalled
          </label>
        </div>

        {/* Notes */}
        <div>
          <label className={labelCls} htmlFor="src-notes">
            Notes (private to the researcher)
          </label>
          <textarea
            id="src-notes"
            name="notes"
            defaultValue={existing?.notes ?? ""}
            className={cn(textareaCls, "mt-1 min-h-[60px] font-sans text-[12px]")}
            maxLength={1200}
          />
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onDone}
            disabled={pending}
            className="h-7 rounded-md border border-border bg-background px-3 text-[11.5px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || contextFull}
            className="h-7 rounded-md border border-primary/45 bg-primary/15 px-3 text-[11.5px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
          >
            {pending ? "Saving…" : existing ? "Save source" : "Add source"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
