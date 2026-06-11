"use client";

import { useRef, useState, useTransition } from "react";
import { Lightbulb, Plus, Trash2, X } from "lucide-react";
import {
  addOpportunity,
  deleteOpportunity,
  type ResearchActionResult,
} from "@/lib/actions/research";
import {
  MAX_OPPORTUNITIES,
  MIN_OPPORTUNITIES,
  PRIORITIES,
  type OpportunityPriority,
  type PipelineOpportunityRow,
} from "@/lib/spec/f2-research";
import { cn } from "@/lib/utils";

/**
 * F2 · B7 Pipeline opportunities ledger.
 *
 * Spec section B7 requires the Researcher to surface 4-5 follow-up
 * opportunities per article: people to interview, datasets to chase,
 * adjacent stories worth pitching at the next F0 session. The ledger
 * surfaces into the editorial memory and the F0 weekly review.
 */

type Props = {
  articleId: string;
  opportunities: PipelineOpportunityRow[];
};

const PRIORITY_TONE: Record<OpportunityPriority, string> = {
  1: "border-destructive/45 bg-destructive/10 text-destructive",
  2: "border-warn/45 bg-warn/10 text-warn",
  3: "border-border-mid bg-secondary text-fg-2",
};

const labelCls =
  "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";
const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const textareaCls =
  "min-h-[70px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

export function F2Opportunities({ articleId, opportunities }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const count = opportunities.length;
  const below = count < MIN_OPPORTUNITIES;
  const above = count > MAX_OPPORTUNITIES;

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[12.5px] font-semibold text-foreground">
            B7 · Pipeline opportunities
          </h2>
          <span className="text-[10.5px] text-um-muted">
            Follow-ups, adjacent stories, sources to chase
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-mono text-[10.5px] tabular-nums",
              below
                ? "text-warn"
                : above
                  ? "text-destructive"
                  : "text-success",
            )}
            title={`Spec requires ${MIN_OPPORTUNITIES}-${MAX_OPPORTUNITIES} per article.`}
          >
            {count} / {MIN_OPPORTUNITIES}-{MAX_OPPORTUNITIES}
          </span>
          <button
            type="button"
            disabled={above}
            onClick={() => ref.current?.showModal()}
            className="flex h-7 items-center gap-1.5 rounded-md border border-primary/45 bg-primary/12 px-2.5 text-[11.5px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Log opportunity
          </button>
        </div>
      </header>

      <div className="px-4 py-3">
        {opportunities.length === 0 ? (
          <p className="text-[11.5px] italic text-um-muted">
            No opportunities logged yet. Surface {MIN_OPPORTUNITIES}-
            {MAX_OPPORTUNITIES} per article — the ledger feeds the next F0
            review.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {opportunities.map((o) => (
              <OpportunityRow key={o.id} row={o} articleId={articleId} />
            ))}
          </ul>
        )}
      </div>

      <OpportunityDialog
        ref={ref}
        articleId={articleId}
        onDone={() => ref.current?.close()}
      />
    </section>
  );
}

function OpportunityRow({
  row,
  articleId,
}: {
  row: PipelineOpportunityRow;
  articleId: string;
}) {
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm("Remove this opportunity from the B7 ledger?")) return;
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("article_id", articleId);
    startTransition(async () => {
      await deleteOpportunity(fd);
    });
  }

  return (
    <li className="group flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-2">
      <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-um-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[12px] font-medium text-foreground">
            {row.title}
          </span>
          {row.priority ? (
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em]",
                PRIORITY_TONE[row.priority],
              )}
            >
              {PRIORITIES.find((p) => p.value === row.priority)?.label}
            </span>
          ) : null}
          {row.category ? (
            <span className="rounded-sm border border-border px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.03em] text-um-muted">
              {row.category}
            </span>
          ) : null}
        </div>
        {row.notes ? (
          <p className="mt-0.5 text-[11px] leading-[1.45] text-fg-2">
            {row.notes}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={remove}
        className="opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-30"
        title="Remove opportunity"
      >
        <Trash2 className="h-3.5 w-3.5 text-um-muted hover:text-destructive" />
      </button>
    </li>
  );
}

function OpportunityDialog({
  ref,
  articleId,
  onDone,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  articleId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [priority, setPriority] = useState<OpportunityPriority | null>(null);

  function submit(fd: FormData) {
    setError(null);
    fd.set("article_id", articleId);
    if (priority !== null) fd.set("priority", String(priority));

    startTransition(async () => {
      const res: ResearchActionResult = await addOpportunity(fd);
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
      className="fixed inset-0 m-auto h-fit max-h-[92vh] w-[560px] max-w-[94vw] overflow-y-auto rounded-lg border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/40 backdrop:backdrop-blur-sm"
    >
      <div
        className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[13px] font-semibold text-foreground">
          Log pipeline opportunity
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
          <label className={labelCls} htmlFor="o-title">
            Headline
          </label>
          <input
            id="o-title"
            name="title"
            placeholder="e.g. Interview Bigband Group founder on the JV with Lloyds"
            className={cn(inputCls, "mt-1")}
            maxLength={240}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={labelCls} htmlFor="o-category">
              Category
            </label>
            <input
              id="o-category"
              name="category"
              placeholder="follow-up, dataset, interview…"
              className={cn(inputCls, "mt-1")}
              maxLength={120}
            />
          </div>
          <div>
            <label className={labelCls}>Priority</label>
            <div className="mt-1 flex gap-1">
              {PRIORITIES.map((p) => (
                <button
                  type="button"
                  key={p.value}
                  onClick={() =>
                    setPriority(priority === p.value ? null : p.value)
                  }
                  className={cn(
                    "h-8 flex-1 rounded-md border px-2 text-[11.5px] font-semibold transition-colors",
                    priority === p.value
                      ? PRIORITY_TONE[p.value]
                      : "border-border bg-background text-fg-2 hover:bg-secondary",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="o-notes">
            Notes
          </label>
          <textarea
            id="o-notes"
            name="notes"
            placeholder="What's the angle? Who's the contact? When is the window?"
            className={cn(textareaCls, "mt-1")}
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
            disabled={pending}
            className="h-7 rounded-md border border-primary/45 bg-primary/15 px-3 text-[11.5px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Add opportunity"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
