"use client";

import { useRef, useState, useTransition } from "react";
import { ClipboardCheck, X } from "lucide-react";
import {
  CATEGORY_TAGS,
  DEFAMATION_TIERS,
  GEOGRAPHIC_TIERS,
  MAX_CATEGORY_TAGS,
  PRIMARY_FRAMES,
  PRODUCTION_OPTIONS,
  scorecardStatus,
  type CategoryTag,
  type DefamationTier,
  type FramingBrief,
  type GeographicTier,
  type PrimaryFrame,
  type ProductionOption,
  type TriageScorecard,
} from "@/lib/spec/f1-triage";
import { saveTriageScorecard, type TriageActionResult } from "@/lib/actions/triage";
import { cn } from "@/lib/utils";

/**
 * F1 Triage Scorecard cell + modal.
 *
 * Rendered as a single cell in the inbox row. Shows a compact status pill —
 * green dot for complete, amber for partial, hollow for empty — plus the
 * shortened triple "O? · T? · GEO" (option, tier, geographic tier) when
 * any value is set. Click opens the full editing modal.
 *
 * The modal binds to the candidate by id. All fields are optional on save —
 * partial scorecards are allowed because B9.2's per-story brief takes
 * the longest to write and editors will often save and come back.
 */

const TIER_TONE: Record<DefamationTier, string> = {
  1: "text-success",
  2: "text-warn",
  3: "text-destructive",
};

const OPTION_TONE: Record<ProductionOption, string> = {
  1: "text-fg-2",
  2: "text-fg-2",
  3: "text-primary",
};

const STATUS_DOT: Record<"complete" | "partial" | "empty", string> = {
  complete: "bg-success",
  partial: "bg-warn",
  empty: "border border-border-mid",
};

const STATUS_LABEL: Record<"complete" | "partial" | "empty", string> = {
  complete: "F1 complete",
  partial: "F1 partial",
  empty: "F1 not set",
};

export type F1CellProps = {
  candidateId: string;
  candidateCode: string;
  scorecard: TriageScorecard;
};

export function F1TriageCell(props: F1CellProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { scorecard } = props;
  const status = scorecardStatus(scorecard);

  const geoShort = scorecard.framing_brief?.geographic_tier
    ? GEOGRAPHIC_TIERS.find((g) => g.value === scorecard.framing_brief?.geographic_tier)?.short
    : null;
  const tagCount = scorecard.framing_brief?.category_tags.length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        title={STATUS_LABEL[status]}
        className="inline-flex w-full items-center gap-1.5 rounded-sm border border-transparent px-1.5 py-1 text-left text-[11px] text-fg-2 hover:border-border hover:bg-secondary hover:text-foreground"
      >
        <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", STATUS_DOT[status])} />
        {status === "empty" ? (
          <span className="text-um-muted">Set F1…</span>
        ) : (
          <span className="flex items-center gap-1 font-mono tabular-nums">
            <span className={scorecard.production_option ? OPTION_TONE[scorecard.production_option] : "text-um-muted"}>
              O{scorecard.production_option ?? "?"}
            </span>
            <span className="text-um-muted">·</span>
            <span className={scorecard.defamation_tier ? TIER_TONE[scorecard.defamation_tier] : "text-um-muted"}>
              T{scorecard.defamation_tier ?? "?"}
            </span>
            <span className="text-um-muted">·</span>
            <span className={geoShort ? "text-fg-2" : "text-um-muted"}>{geoShort ?? "—"}</span>
            {tagCount > 0 ? (
              <span className="ml-0.5 rounded-sm bg-secondary px-1 text-[9.5px] font-semibold text-fg-2">
                {tagCount}t
              </span>
            ) : null}
          </span>
        )}
      </button>
      <F1Dialog ref={ref} {...props} onDone={() => ref.current?.close()} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  MODAL                                                                     */
/* -------------------------------------------------------------------------- */

function F1Dialog({
  ref,
  candidateId,
  candidateCode,
  scorecard,
  onDone,
}: F1CellProps & {
  ref: React.RefObject<HTMLDialogElement | null>;
  onDone: () => void;
}) {
  return (
    <dialog
      ref={ref}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="fixed inset-0 m-auto h-fit max-h-[92vh] w-[720px] max-w-[94vw] overflow-y-auto rounded-lg border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/40 backdrop:backdrop-blur-sm"
    >
      <div
        className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <h3 className="text-[13px] font-semibold text-foreground">
            F1 Triage Scorecard
          </h3>
          <span className="font-mono text-[11px] text-um-muted">{candidateCode}</span>
        </div>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-um-muted hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
        <F1Form candidateId={candidateId} scorecard={scorecard} onDone={onDone} />
      </div>
    </dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  FORM                                                                      */
/* -------------------------------------------------------------------------- */

const labelCls =
  "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";
const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const textareaCls =
  "min-h-[88px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

function F1Form({
  candidateId,
  scorecard,
  onDone,
}: {
  candidateId: string;
  scorecard: TriageScorecard;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [option, setOption] = useState<ProductionOption | null>(scorecard.production_option);
  const [tier, setTier] = useState<DefamationTier | null>(scorecard.defamation_tier);
  const [geo, setGeo] = useState<GeographicTier | null>(
    scorecard.framing_brief?.geographic_tier ?? null,
  );
  const [tags, setTags] = useState<CategoryTag[]>(
    scorecard.framing_brief?.category_tags ?? [],
  );
  const [frame, setFrame] = useState<PrimaryFrame | null>(
    scorecard.framing_brief?.primary_frame ?? null,
  );

  function toggleTag(tag: CategoryTag) {
    setTags((cur) => {
      if (cur.includes(tag)) return cur.filter((t) => t !== tag);
      if (cur.length >= MAX_CATEGORY_TAGS) return cur;
      return [...cur, tag];
    });
  }

  function submit(fd: FormData) {
    setError(null);
    // selected values come from controlled state; multi-select tags need
    // to be written into the FormData as repeated entries before submit.
    fd.delete("category_tags");
    tags.forEach((t) => fd.append("category_tags", t));
    fd.set("candidate_id", candidateId);
    if (option !== null) fd.set("production_option", String(option));
    if (tier !== null) fd.set("defamation_tier", String(tier));
    if (geo !== null) fd.set("geographic_tier", geo);
    if (frame !== null) fd.set("primary_frame", frame);

    startTransition(async () => {
      const res: TriageActionResult = await saveTriageScorecard(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  const fb: FramingBrief | null = scorecard.framing_brief;

  return (
    <form action={submit} className="flex flex-col gap-4">
      {/* Production option + defamation tier — pill row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>B0 — Production option</label>
          <div className="mt-1.5 flex flex-col gap-1">
            {PRODUCTION_OPTIONS.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => setOption(option === o.value ? null : o.value)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                  option === o.value
                    ? "border-primary/45 bg-accent/40 text-foreground"
                    : "border-border bg-background text-fg-2 hover:bg-secondary",
                )}
              >
                <span className="text-[12px] font-semibold">{o.label}</span>
                <span className="text-[10.5px] text-um-muted">{o.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>D-Tiers — Defamation</label>
          <div className="mt-1.5 flex flex-col gap-1">
            {DEFAMATION_TIERS.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => setTier(tier === t.value ? null : t.value)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                  tier === t.value
                    ? cn(
                        "bg-accent/40 text-foreground",
                        t.value === 1 && "border-success/45",
                        t.value === 2 && "border-warn/45",
                        t.value === 3 && "border-destructive/45",
                      )
                    : "border-border bg-background text-fg-2 hover:bg-secondary",
                )}
              >
                <span
                  className={cn(
                    "text-[12px] font-semibold",
                    tier === t.value
                      ? cn(
                          t.value === 1 && "text-success",
                          t.value === 2 && "text-warn",
                          t.value === 3 && "text-destructive",
                        )
                      : undefined,
                  )}
                >
                  {t.label}
                </span>
                <span className="text-[10.5px] text-um-muted">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* B9.1 Axis 1 — Geographic tier */}
      <div>
        <label className={labelCls}>B9.1 Axis 1 — Geographic tier</label>
        <div className="mt-1.5 flex gap-1.5">
          {GEOGRAPHIC_TIERS.map((g) => (
            <button
              type="button"
              key={g.value}
              onClick={() => setGeo(geo === g.value ? null : g.value)}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-[12px] font-medium transition-colors",
                geo === g.value
                  ? "border-primary/45 bg-accent/40 text-foreground"
                  : "border-border bg-background text-fg-2 hover:bg-secondary",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* B9.1 Axis 2 — Category tags (≤3) */}
      <div>
        <div className="flex items-baseline justify-between">
          <label className={labelCls}>
            B9.1 Axis 2 — Category tags
          </label>
          <span className="font-mono text-[10.5px] text-um-muted tabular-nums">
            {tags.length} / {MAX_CATEGORY_TAGS}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {CATEGORY_TAGS.map((tag) => {
            const on = tags.includes(tag);
            const idx = tags.indexOf(tag);
            const disabled = !on && tags.length >= MAX_CATEGORY_TAGS;
            return (
              <button
                type="button"
                key={tag}
                disabled={disabled}
                onClick={() => toggleTag(tag)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  on
                    ? "border-primary/45 bg-accent/60 text-foreground"
                    : "border-border bg-background text-fg-2 hover:bg-secondary",
                  disabled && "cursor-not-allowed opacity-40",
                )}
              >
                {on ? (
                  <span className="mr-1 font-mono text-[9.5px] font-bold text-primary">
                    {idx + 1}
                  </span>
                ) : null}
                {tag}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[10.5px] text-um-muted">
          Tap up to three in priority order (primary → secondary → tertiary).
        </p>
      </div>

      {/* B9 Axis 3 — Primary frame */}
      <div>
        <label className={labelCls}>B9 Axis 3 — Primary frame</label>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {PRIMARY_FRAMES.map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFrame(frame === f ? null : f)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-left text-[11.5px] transition-colors",
                frame === f
                  ? "border-primary/45 bg-accent/40 text-foreground"
                  : "border-border bg-background text-fg-2 hover:bg-secondary",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Scottish anchor */}
      <div>
        <label className={labelCls} htmlFor="f1-anchor">
          Scottish anchor
        </label>
        <input
          id="f1-anchor"
          name="scottish_anchor"
          defaultValue={fb?.scottish_anchor ?? ""}
          maxLength={240}
          placeholder="e.g. NatWest Group's Edinburgh-based AI research unit"
          className={cn(inputCls, "mt-1")}
        />
        <p className="mt-1 text-[10.5px] text-um-muted">
          Named company / institution / regulator / market / person — the substantive Scottish stake.
        </p>
      </div>

      {/* Per-story brief (B9.2) */}
      <div>
        <label className={labelCls} htmlFor="f1-brief">
          B9.2 — Per-story brief
        </label>
        <textarea
          id="f1-brief"
          name="per_story_brief"
          defaultValue={fb?.per_story_brief ?? ""}
          maxLength={1200}
          placeholder="Two or three sentences telling the Writer what to lead with, what to subordinate, and what the central point of the piece is."
          className={cn(textareaCls, "mt-1")}
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
          {pending ? "Saving…" : "Save scorecard"}
        </button>
      </div>
    </form>
  );
}
