"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Pause,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  OPPORTUNITY_SECTIONS,
  OPPORTUNITY_VERDICTS,
  isStaleForAutoDrop,
  type ArticlePipelineOpportunityRow,
  type OpportunitySection,
  type OpportunitySectionSummary,
  type OpportunityVerdict,
} from "@/lib/spec/a3-opportunities";
import {
  bumpOpportunitySweep,
  deleteOpportunityRow,
  setOpportunityVerdict,
  type OpportunityActionResult,
} from "@/lib/actions/opportunities";
import { cn } from "@/lib/utils";

type ArticleRefRow = {
  id: string;
  headline: string;
  slug: string | null;
  title_id: string;
};

const SECTION_DEF: Record<
  OpportunitySection,
  (typeof OPPORTUNITY_SECTIONS)[number]
> = Object.fromEntries(
  OPPORTUNITY_SECTIONS.map((s) => [s.value, s]),
) as Record<OpportunitySection, (typeof OPPORTUNITY_SECTIONS)[number]>;

const VERDICT_ICON: Record<
  OpportunityVerdict,
  React.ComponentType<{ className?: string }>
> = {
  pending: ChevronRight,
  commission: CheckCircle2,
  park: Pause,
  drop: XCircle,
};

export function OpportunitySectionBlock({
  section,
  rows,
  summary,
  articleMap,
  canEdit,
  canDelete,
}: {
  section: OpportunitySection;
  rows: ArticlePipelineOpportunityRow[];
  summary: OpportunitySectionSummary | undefined;
  articleMap: Record<string, ArticleRefRow>;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const def = SECTION_DEF[section];
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-baseline gap-2 border-b border-border bg-background/40 px-3 py-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
          §{def.code}
        </span>
        <h2 className="text-[12.5px] font-semibold text-foreground">
          {def.label}
        </h2>
        <span className="text-[10.5px] text-um-muted">{def.description}</span>
        {summary ? (
          <span className="ml-auto font-mono text-[10.5px] text-um-muted">
            {summary.total} total · {summary.pending} pending ·{" "}
            {summary.commission} commission · {summary.park} park ·{" "}
            {summary.drop} drop
          </span>
        ) : null}
      </header>

      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11.5px] text-um-muted">
          No opportunities in this section yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <OpportunityRow
              key={r.id}
              row={r}
              article={articleMap[r.article_id] ?? null}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function OpportunityRow({
  row,
  article,
  canEdit,
  canDelete,
}: {
  row: ArticlePipelineOpportunityRow;
  article: ArticleRefRow | null;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [notes, setNotes] = useState(row.verdict_notes ?? "");
  const [pending, startTransition] = useTransition();
  const [pendingBump, startBumpTransition] = useTransition();
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const stale = isStaleForAutoDrop(row);

  function stamp(v: OpportunityVerdict) {
    setError(null);
    setSaved(false);
    if ((v === "drop" || v === "park") && !notes.trim()) {
      setError(
        v === "drop"
          ? "Drop needs a one-line note for the K5 audit trail."
          : "Park needs a note (why parked, when to revisit).",
      );
      return;
    }
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("verdict", v);
    fd.set("verdict_notes", notes);
    startTransition(async () => {
      const res: OpportunityActionResult = await setOpportunityVerdict(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    });
  }

  function bumpOnly() {
    setError(null);
    const fd = new FormData();
    fd.set("id", row.id);
    startBumpTransition(async () => {
      const res: OpportunityActionResult = await bumpOpportunitySweep(fd);
      if (!res.ok) setError(res.error);
    });
  }

  function remove() {
    if (!confirm(`Delete opportunity "${row.title}"?`)) return;
    const fd = new FormData();
    fd.set("id", row.id);
    startDeleteTransition(async () => {
      const res: OpportunityActionResult = await deleteOpportunityRow(fd);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <li
      className={cn(
        "space-y-2 px-3 py-3",
        stale && "bg-warn/5",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[12.5px] font-medium text-foreground">
          {row.title}
        </span>
        {row.priority ? (
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em]",
              row.priority === 1
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : row.priority === 2
                  ? "border-warn/40 bg-warn/10 text-warn"
                  : "border-border bg-secondary text-um-muted",
            )}
          >
            P{row.priority}
          </span>
        ) : null}
        {row.category ? (
          <span className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-um-muted">
            {row.category}
          </span>
        ) : null}
        <VerdictPill verdict={row.verdict} />
        {stale ? (
          <span className="flex items-center gap-1 rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] text-warn">
            <AlertTriangle className="h-3 w-3" />
            stale · {row.sweep_count} sweeps
          </span>
        ) : (
          <span className="ml-auto font-mono text-[10.5px] text-um-muted">
            {row.sweep_count} sweep{row.sweep_count === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {row.notes ? (
        <p className="text-[11.5px] leading-[1.45] text-fg-2">{row.notes}</p>
      ) : null}

      {article ? (
        <Link
          href={`/articles/${article.id}`}
          className="inline-flex items-center gap-1 font-mono text-[10.5px] text-primary hover:underline"
        >
          → source article: {article.headline}
        </Link>
      ) : null}

      {row.verdict !== "pending" ? (
        <div className="rounded-sm border border-border bg-background/40 px-2 py-1.5 text-[10.5px] text-um-muted">
          <span className="font-mono uppercase">
            {row.verdict} stamp
          </span>
          {row.verdict_at ? (
            <span>
              {" "}
              ·{" "}
              {new Date(row.verdict_at).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
          {row.verdict_notes ? (
            <p className="mt-0.5 text-[11px] text-fg-2">
              {row.verdict_notes}
            </p>
          ) : null}
        </div>
      ) : null}

      {canEdit ? (
        <div className="space-y-1.5">
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setError(null);
            }}
            rows={2}
            placeholder="Verdict note (required for PARK / DROP — context for the K5 audit trail)."
            maxLength={1200}
            className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {OPPORTUNITY_VERDICTS.filter((v) => v.value !== "pending").map(
              (v) => {
                const Icon = VERDICT_ICON[v.value];
                return (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => stamp(v.value)}
                    disabled={pending}
                    className={cn(
                      "flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium disabled:opacity-50",
                      v.tone === "success"
                        ? "border-success/45 bg-success/10 text-success hover:bg-success/15"
                        : v.tone === "warn"
                          ? "border-warn/45 bg-warn/10 text-warn hover:bg-warn/15"
                          : v.tone === "destructive"
                            ? "border-destructive/45 bg-destructive/10 text-destructive hover:bg-destructive/15"
                            : "border-border bg-background text-fg-2 hover:bg-secondary",
                    )}
                  >
                    {pending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Icon className="h-3 w-3" />
                    )}
                    {v.short}
                  </button>
                );
              },
            )}
            <button
              type="button"
              onClick={bumpOnly}
              disabled={pendingBump}
              title="Mark as reviewed this week without changing the verdict"
              className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[11px] text-fg-2 hover:bg-secondary disabled:opacity-50"
            >
              {pendingBump ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              Mark reviewed
            </button>
            {saved ? (
              <span className="flex items-center gap-1 text-[10.5px] text-success">
                <CheckCircle2 className="h-3 w-3" />
                saved
              </span>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                onClick={remove}
                disabled={pendingDelete}
                className="ml-auto flex h-7 items-center gap-1 rounded-md border border-destructive/35 bg-destructive/10 px-2 text-[11px] text-destructive hover:bg-destructive/15 disabled:opacity-50"
              >
                {pendingDelete ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Delete
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}
    </li>
  );
}

function VerdictPill({ verdict }: { verdict: OpportunityVerdict }) {
  const def = OPPORTUNITY_VERDICTS.find((v) => v.value === verdict)!;
  const tone =
    def.tone === "success"
      ? "border-success/40 bg-success/10 text-success"
      : def.tone === "warn"
        ? "border-warn/40 bg-warn/10 text-warn"
        : def.tone === "destructive"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-secondary text-um-muted";
  return (
    <span
      className={cn(
        "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em]",
        tone,
      )}
    >
      {def.short}
    </span>
  );
}
