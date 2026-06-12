"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  CircleDot,
  Loader2,
  Save,
  Type,
} from "lucide-react";
import {
  HEADLINE_CHAR_SOFT_CAP,
  MAX_HEADLINE_OPTIONS,
  summariseHeadlines,
  type HeadlineOption,
} from "@/lib/spec/f3-headlines";
import {
  saveHeadlineOptions,
  selectHeadline,
  type ArticleWriteActionResult,
} from "@/lib/actions/article-write";
import { cn } from "@/lib/utils";

/**
 * F3 three-headline set + F5 selection.
 *
 * Renders three rows. Each row:
 *   - Text input (≤90 chars soft cap with live counter + over-cap warning).
 *   - Rationale textarea (B6.1 click-bait-leaning justification — for NFP footer).
 *   - "Use as live headline" radio (F5 step 1 selection).
 *
 * One Save button persists all three; selection has its own button so the
 * Editor can flip the chosen one without re-saving the whole set.
 */

type Props = {
  articleId: string;
  initialOptions: HeadlineOption[];
  initialSelectedIdx: 0 | 1 | 2 | null;
  readOnly?: boolean;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const SLOT_LABELS = ["Option 1", "Option 2", "Option 3"] as const;

function padOptions(opts: HeadlineOption[]): HeadlineOption[] {
  const filled: HeadlineOption[] = [...opts];
  while (filled.length < MAX_HEADLINE_OPTIONS) {
    filled.push({ text: "", rationale: "", char_count: 0 });
  }
  return filled.slice(0, MAX_HEADLINE_OPTIONS);
}

export function HeadlineOptionsEditor({
  articleId,
  initialOptions,
  initialSelectedIdx,
  readOnly = false,
}: Props) {
  const [options, setOptions] = useState<HeadlineOption[]>(
    padOptions(initialOptions),
  );
  const [selectedIdx, setSelectedIdx] = useState<0 | 1 | 2 | null>(
    initialSelectedIdx,
  );
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const summary = summariseHeadlines({ options, selected_idx: selectedIdx });

  function patch(idx: number, field: "text" | "rationale", value: string) {
    setOptions((prev) => {
      const next = [...prev];
      const cur = next[idx] ?? { text: "", rationale: "", char_count: 0 };
      const updated =
        field === "text"
          ? { ...cur, text: value, char_count: value.length }
          : { ...cur, rationale: value };
      next[idx] = updated;
      return next;
    });
  }

  function saveAll() {
    if (readOnly) return;
    setError(null);
    setStatus("saving");
    const fd = new FormData();
    fd.set("article_id", articleId);
    options.forEach((o, i) => {
      fd.set(`option_${i}_text`, o.text);
      fd.set(`option_${i}_rationale`, o.rationale);
    });
    startTransition(async () => {
      const res: ArticleWriteActionResult = await saveHeadlineOptions(fd);
      if (!res.ok) {
        setError(res.error);
        setStatus("error");
        return;
      }
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2500);
    });
  }

  function pickHeadline(idx: 0 | 1 | 2) {
    if (readOnly) return;
    if (!options[idx]?.text.trim()) {
      setError(`Option ${idx + 1} is empty — write a headline first.`);
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("selected_idx", String(idx));
    startTransition(async () => {
      const res: ArticleWriteActionResult = await selectHeadline(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSelectedIdx(idx);
    });
  }

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Type className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          Headlines · three options
        </h2>
        <span className="ml-1 font-mono text-[10px] text-um-muted">
          F3 · B6.1 · soft cap {HEADLINE_CHAR_SOFT_CAP} chars
        </span>
        <div className="ml-auto flex items-center gap-2">
          <StatusPill
            status={status}
            pending={pending}
            ready={summary.ready}
            filled={summary.filled}
            overCap={summary.overCap}
            hasSelection={summary.hasSelection}
          />
          {!readOnly ? (
            <button
              type="button"
              onClick={saveAll}
              disabled={pending}
              className={cn(
                "flex h-7 items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50",
              )}
            >
              <Save className="h-3 w-3" />
              Save options
            </button>
          ) : null}
        </div>
      </header>

      <p className="border-b border-border bg-background/40 px-3 py-2 text-[10.5px] leading-[1.5] text-um-muted">
        F3 produces three options, each ≤{HEADLINE_CHAR_SOFT_CAP} chars,
        click-bait-leaning per B6.1. F5 selects one — or writes a fourth in
        the main headline field if all three fail the policy. Rationale lines
        feed the NFP footer (H9 / C9).
      </p>

      <div className="divide-y divide-border">
        {options.map((opt, i) => (
          <OptionRow
            key={i}
            idx={i as 0 | 1 | 2}
            label={SLOT_LABELS[i]}
            option={opt}
            selected={selectedIdx === i}
            readOnly={readOnly || pending}
            onChange={(field, value) => patch(i, field, value)}
            onSelect={() => pickHeadline(i as 0 | 1 | 2)}
          />
        ))}
      </div>

      {error ? (
        <div className="border-t border-border bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}
    </section>
  );
}

function OptionRow({
  idx,
  label,
  option,
  selected,
  readOnly,
  onChange,
  onSelect,
}: {
  idx: 0 | 1 | 2;
  label: string;
  option: HeadlineOption;
  selected: boolean;
  readOnly: boolean;
  onChange: (field: "text" | "rationale", value: string) => void;
  onSelect: () => void;
}) {
  const chars = option.text.length;
  const over = chars > HEADLINE_CHAR_SOFT_CAP;
  const blank = option.text.trim().length === 0;

  return (
    <div
      className={cn(
        "px-3 py-3 transition-colors",
        selected ? "bg-success/5" : "",
      )}
    >
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          {label}
        </span>
        <span
          className={cn(
            "font-mono text-[10.5px] tabular-nums",
            blank
              ? "text-um-muted"
              : over
                ? "text-destructive"
                : chars > HEADLINE_CHAR_SOFT_CAP - 10
                  ? "text-warn"
                  : "text-fg-2",
          )}
        >
          {chars}/{HEADLINE_CHAR_SOFT_CAP}
        </span>
        {over ? (
          <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-destructive">
            <AlertTriangle className="h-3 w-3" />
            soft cap
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          {selected ? (
            <span className="flex items-center gap-1 rounded-md border border-success/45 bg-success/10 px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.05em] text-success">
              <Check className="h-3 w-3" />
              live headline
            </span>
          ) : (
            <button
              type="button"
              onClick={onSelect}
              disabled={readOnly || blank}
              className={cn(
                "flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] text-fg-2 hover:bg-secondary disabled:opacity-50",
              )}
            >
              <CircleDot className="h-3 w-3" />
              use as live
            </button>
          )}
        </div>
      </div>

      <input
        type="text"
        value={option.text}
        onChange={(e) => onChange("text", e.target.value)}
        disabled={readOnly}
        placeholder={`Headline option ${idx + 1} — click-bait-leaning, ≤${HEADLINE_CHAR_SOFT_CAP} chars`}
        className={cn(
          "w-full rounded-md border bg-background px-2.5 py-1.5 text-[14px] font-semibold leading-[1.3] text-foreground placeholder:text-um-muted disabled:opacity-60",
          over
            ? "border-destructive/45"
            : selected
              ? "border-success/45"
              : "border-border-mid",
        )}
      />

      <textarea
        rows={2}
        value={option.rationale}
        onChange={(e) => onChange("rationale", e.target.value)}
        disabled={readOnly}
        placeholder="Rationale — why this framing? B6.1 click-bait-leaning notes for the NFP footer."
        className="mt-1.5 w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-foreground placeholder:text-um-muted disabled:opacity-60"
        maxLength={500}
      />
    </div>
  );
}

function StatusPill({
  status,
  pending,
  ready,
  filled,
  overCap,
  hasSelection,
}: {
  status: SaveStatus;
  pending: boolean;
  ready: boolean;
  filled: number;
  overCap: number;
  hasSelection: boolean;
}) {
  if (pending || status === "saving") {
    return (
      <span className="flex items-center gap-1.5 rounded-sm border border-warn/35 bg-warn/10 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-warn">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 rounded-sm border border-destructive/35 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-destructive">
        <AlertTriangle className="h-3 w-3" />
        Save failed
      </span>
    );
  }
  if (ready) {
    return (
      <span className="flex items-center gap-1.5 rounded-sm border border-success/35 bg-success/10 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-success">
        <Check className="h-3 w-3" />
        3/3 · live picked
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-um-muted">
      {filled}/3 written · {overCap > 0 ? `${overCap} over cap · ` : ""}
      {hasSelection ? "live picked" : "no selection"}
    </span>
  );
}
