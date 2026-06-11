"use client";

import { useRef, useState, useTransition } from "react";
import { MessageSquareQuote, Plus, Trash2, X } from "lucide-react";
import {
  addQuote,
  deleteQuote,
  updateQuote,
  type ResearchActionResult,
} from "@/lib/actions/research";
import type {
  ArticleQuoteRow,
  ArticleSourceRow,
} from "@/lib/spec/f2-research";
import { cn } from "@/lib/utils";

/**
 * F2 Verbatim Quote Ledger.
 *
 * The ledger is the substrate for:
 *   - B1 / C1 — verbatim audit hard gate (string-equality vs source)
 *   - C3      — paragraph-break preservation (stored as \n\n)
 *   - F6 H1   — Reviewer's verbatim gate
 *   - F9 A4   — Pre-publish verbatim re-audit
 *
 * Quote text is stored exactly as captured. No whitespace collapse, no
 * smart-quote normalisation. Speaker / role / institution are metadata
 * only and may be edited freely.
 */

type Props = {
  articleId: string;
  quotes: ArticleQuoteRow[];
  sources: ArticleSourceRow[];
};

export function F2QuoteLedger({ articleId, quotes, sources }: Props) {
  const addRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<ArticleQuoteRow | null>(null);

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[12.5px] font-semibold text-foreground">
            Verbatim quote ledger
          </h2>
          <span className="text-[10.5px] text-um-muted">
            B1 / C1 / C3 substrate · Unicode + paragraph breaks preserved
          </span>
        </div>
        <button
          type="button"
          onClick={() => addRef.current?.showModal()}
          className="flex h-7 items-center gap-1.5 rounded-md border border-primary/45 bg-primary/12 px-2.5 text-[11.5px] font-semibold text-primary hover:bg-primary/20"
        >
          <Plus className="h-3.5 w-3.5" />
          Capture quote
        </button>
      </header>

      <div className="px-4 py-3">
        {quotes.length === 0 ? (
          <p className="text-[11.5px] italic text-um-muted">
            No quotes captured yet. The Writer can only render quoted text that
            exists in this ledger — verbatim and unedited.
          </p>
        ) : (
          <ul className="space-y-2">
            {quotes.map((q) => (
              <QuoteRow
                key={q.id}
                row={q}
                sources={sources}
                onEdit={() => {
                  setEditing(q);
                  editRef.current?.showModal();
                }}
                articleId={articleId}
              />
            ))}
          </ul>
        )}
      </div>

      <QuoteDialog
        ref={addRef}
        articleId={articleId}
        sources={sources}
        onDone={() => addRef.current?.close()}
      />
      {editing ? (
        <QuoteDialog
          key={editing.id}
          ref={editRef}
          articleId={articleId}
          sources={sources}
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
/*  Row                                                                       */
/* -------------------------------------------------------------------------- */

function QuoteRow({
  row,
  sources,
  onEdit,
  articleId,
}: {
  row: ArticleQuoteRow;
  sources: ArticleSourceRow[];
  onEdit: () => void;
  articleId: string;
}) {
  const [pending, startTransition] = useTransition();
  const source = sources.find((s) => s.id === row.source_id);
  const paragraphs = row.quote_text.split(/\n\n+/);

  function remove() {
    if (!confirm("Remove this quote from the ledger?")) return;
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("article_id", articleId);
    startTransition(async () => {
      await deleteQuote(fd);
    });
  }

  return (
    <li className="group rounded-md border border-border bg-background px-3 py-2.5">
      <div className="flex items-start gap-2">
        <MessageSquareQuote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-um-muted" />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onEdit}
            className="block w-full text-left"
          >
            <div className="space-y-1.5 border-l-2 border-primary/45 pl-2.5 font-mono text-[11.5px] leading-[1.55] text-foreground">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10.5px] text-um-muted">
            {row.speaker ? (
              <span className="text-fg-2">
                — <span className="font-medium text-foreground">{row.speaker}</span>
                {row.role ? `, ${row.role}` : ""}
                {row.institution ? `, ${row.institution}` : ""}
              </span>
            ) : (
              <span className="italic">No speaker attributed</span>
            )}
            {source ? (
              <span className="flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9.5px]">
                from: {hostname(source.url)}
              </span>
            ) : (
              <span className="rounded-sm border border-warn/45 bg-warn/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em] text-warn">
                NO SOURCE LINK
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className="opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-30"
          title="Remove quote"
        >
          <Trash2 className="h-3.5 w-3.5 text-um-muted hover:text-destructive" />
        </button>
      </div>
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
/*  Dialog                                                                    */
/* -------------------------------------------------------------------------- */

const labelCls =
  "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";
const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

function QuoteDialog({
  ref,
  articleId,
  sources,
  existing,
  onDone,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  articleId: string;
  sources: ArticleSourceRow[];
  existing?: ArticleQuoteRow;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string>(existing?.quote_text ?? "");

  function submit(fd: FormData) {
    setError(null);
    fd.set("article_id", articleId);
    fd.set("quote_text", text);

    startTransition(async () => {
      const res: ResearchActionResult = existing
        ? await (async () => {
            fd.set("id", existing.id);
            return updateQuote(fd);
          })()
        : await addQuote(fd);
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
          {existing ? "Edit quote" : "Capture quote"}
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
        <div>
          <label className={labelCls} htmlFor="q-text">
            Quote (verbatim — paragraph breaks preserved as blank lines)
          </label>
          <textarea
            id="q-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste exactly as captured from the source. Do not edit, do not normalise quotes, do not collapse whitespace."
            className="mt-1 min-h-[160px] w-full whitespace-pre-wrap rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
            spellCheck={false}
          />
          <p className="mt-1 text-[10.5px] text-um-muted">
            Byte-exact retention: F6 H1 and F9 A4 string-compare against this
            ledger.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className={labelCls} htmlFor="q-speaker">
              Speaker
            </label>
            <input
              id="q-speaker"
              name="speaker"
              defaultValue={existing?.speaker ?? ""}
              className={cn(inputCls, "mt-1")}
              maxLength={240}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="q-role">
              Role
            </label>
            <input
              id="q-role"
              name="role"
              defaultValue={existing?.role ?? ""}
              className={cn(inputCls, "mt-1")}
              maxLength={240}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="q-inst">
              Institution
            </label>
            <input
              id="q-inst"
              name="institution"
              defaultValue={existing?.institution ?? ""}
              className={cn(inputCls, "mt-1")}
              maxLength={240}
            />
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="q-source">
            Linked source
          </label>
          <select
            id="q-source"
            name="source_id"
            defaultValue={existing?.source_id ?? ""}
            className={cn(inputCls, "mt-1")}
          >
            <option value="">— No source linked</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title ?? s.url}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10.5px] text-um-muted">
            Quotes without a linked source raise a flag at F6 H1.
          </p>
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
            disabled={pending || !text.trim()}
            className="h-7 rounded-md border border-primary/45 bg-primary/15 px-3 text-[11.5px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
          >
            {pending ? "Saving…" : existing ? "Save quote" : "Add quote"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
