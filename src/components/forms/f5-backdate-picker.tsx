"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Eraser,
  Loader2,
  Save,
} from "lucide-react";
import {
  BACKDATE_KINDS,
  backdateIso,
  formatBackdate,
  fridayAfter,
  fridayOfWeek,
  parseBackdate,
  validateBackdate,
  type BackdateKind,
} from "@/lib/spec/f5-backdate";
import {
  clearBackdate,
  saveBackdate,
  type BackdateActionResult,
} from "@/lib/actions/backdate";
import { cn } from "@/lib/utils";

/**
 * F5 step 2 — Backdate selection.
 *
 * Three blocks:
 *   - Rule picker (4 kinds — friday_of_week / friday_after / source_date / custom).
 *   - Date input (pre-fills from the picked rule when an event date is supplied).
 *   - Rationale textarea (required for `custom`).
 *
 * Hard rules:
 *   - Tier 3 → backdate disabled completely, shows the D-rule banner.
 *   - Future-dated backdate blocks save.
 *   - Custom kind requires rationale text.
 *
 * Soft warnings (surface but allow save):
 *   - friday_after more than 6 weeks after event (D4 reframe rule).
 *   - Date is not a Friday (B5 prefers Friday timestamps).
 */

type Props = {
  articleId: string;
  initialBackdate: string | null;
  initialKind: BackdateKind | null;
  initialRationale: string | null;
  defamationTier: 1 | 2 | 3 | null;
  eventDate?: string | null;
  readOnly?: boolean;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function BackdatePicker({
  articleId,
  initialBackdate,
  initialKind,
  initialRationale,
  defamationTier,
  eventDate,
  readOnly = false,
}: Props) {
  const tier3Locked = defamationTier === 3;

  // Default to the source's own date — most PR/submitted pieces should carry
  // the date the source published, and it's a safe, defensible default the
  // editor can override. Only applied when nothing is on file yet.
  const [kind, setKind] = useState<BackdateKind | null>(
    tier3Locked ? null : (initialKind ?? "source_date"),
  );
  const [dateStr, setDateStr] = useState<string>(() => {
    if (tier3Locked) return "";
    if (initialBackdate) return initialBackdate;
    // Defaulting to source_date: prefill the source's published date if known.
    if (!initialKind && eventDate) return eventDate;
    return "";
  });
  const [rationale, setRationale] = useState<string>(initialRationale ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const eventDateParsed = eventDate ? parseBackdate(eventDate) : null;

  // Suggestions hinge off the event date (if supplied) or today's date.
  const suggestions = useMemo(() => {
    const ref = eventDateParsed ?? new Date();
    return {
      friday_of_week: backdateIso(fridayOfWeek(ref)),
      friday_after: backdateIso(fridayAfter(ref)),
    };
  }, [eventDateParsed]);

  // Live validation preview — shows warnings before save.
  const livePreview = useMemo(() => {
    if (tier3Locked) return null;
    return validateBackdate({
      backdate: parseBackdate(dateStr),
      kind,
      rationale,
      defamationTier: defamationTier,
      eventDate: eventDateParsed,
    });
  }, [dateStr, kind, rationale, defamationTier, eventDateParsed, tier3Locked]);

  function applyKindAndSuggest(newKind: BackdateKind) {
    setKind(newKind);
    setError(null);
    setStatus("idle");
    if (newKind === "friday_of_week") setDateStr(suggestions.friday_of_week);
    else if (newKind === "friday_after") setDateStr(suggestions.friday_after);
    else if (newKind === "source_date" && eventDate) setDateStr(eventDate);
    // custom keeps whatever is in the field
  }

  function save() {
    if (readOnly || tier3Locked) return;
    setError(null);
    setWarnings([]);
    setStatus("saving");
    const fd = new FormData();
    fd.set("article_id", articleId);
    if (kind) fd.set("kind", kind);
    fd.set("backdate", dateStr);
    fd.set("rationale", rationale);
    if (eventDate) fd.set("event_date", eventDate);

    startTransition(async () => {
      const res: BackdateActionResult = await saveBackdate(fd);
      if (!res.ok) {
        setError(res.error);
        setStatus("error");
        return;
      }
      setWarnings(res.warnings);
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2500);
    });
  }

  function reset() {
    if (readOnly) return;
    setError(null);
    setWarnings([]);
    const fd = new FormData();
    fd.set("article_id", articleId);
    startTransition(async () => {
      const res: BackdateActionResult = await clearBackdate(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setKind(null);
      setDateStr("");
      setRationale("");
      setStatus("idle");
    });
  }

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <CalendarClock className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          Backdate · F5 step 2
        </h2>
        <span className="ml-1 font-mono text-[10px] text-um-muted">
          B5 · D3 · D4
        </span>
        <div className="ml-auto flex items-center gap-2">
          <StatusPill
            status={status}
            pending={pending}
            tier3Locked={tier3Locked}
            persisted={!!initialBackdate}
            warningsCount={(livePreview?.warnings.length ?? 0) + warnings.length}
          />
          {!readOnly && !tier3Locked ? (
            <>
              <button
                type="button"
                onClick={save}
                disabled={pending || !kind || !dateStr}
                className="flex h-7 items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
              >
                <Save className="h-3 w-3" />
                Save backdate
              </button>
              {initialBackdate ? (
                <button
                  type="button"
                  onClick={reset}
                  disabled={pending}
                  className="flex h-7 items-center gap-1 rounded-sm border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-50"
                >
                  <Eraser className="h-3 w-3" />
                  Clear
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      {tier3Locked ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] leading-[1.5] text-destructive">
          Tier 3 — backdating is forbidden by the D rule. Publish with full
          transparency on the publication date.
        </div>
      ) : (
        <p className="border-b border-border bg-background/40 px-3 py-2 text-[10.5px] leading-[1.5] text-um-muted">
          D3 offers two defensible options: <strong>Friday of publication week</strong>{" "}
          for events earlier in the week, and{" "}
          <strong>Friday after the event</strong> for weekend events. Source-own
          date applies when the source itself runs on a Friday. Custom requires
          rationale and surfaces in the NFP footer + pack section 5.
        </p>
      )}

      {!tier3Locked ? (
        <div className="space-y-3 px-3 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {BACKDATE_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => applyKindAndSuggest(k.value)}
                disabled={readOnly || pending}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors disabled:opacity-50",
                  kind === k.value
                    ? "border-primary/45 bg-primary/10"
                    : "border-border bg-background hover:bg-secondary",
                )}
              >
                <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em]">
                  {kind === k.value ? (
                    <Check className="h-3 w-3 text-primary" />
                  ) : null}
                  {k.short}
                </span>
                <span className="text-[12px] font-medium text-foreground">
                  {k.label}
                </span>
                <span className="text-[10.5px] leading-[1.45] text-um-muted">
                  {k.hint}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
                Backdate
              </span>
              <input
                type="date"
                value={dateStr}
                onChange={(e) => {
                  setDateStr(e.target.value);
                  setStatus("idle");
                }}
                disabled={readOnly || pending}
                className="h-8 rounded-md border border-border bg-background px-2 font-mono text-[12px] text-foreground disabled:opacity-50"
              />
            </label>
            {dateStr ? (
              <span className="font-mono text-[11px] text-fg-2">
                {formatBackdate(parseBackdate(dateStr))}
              </span>
            ) : null}
            {eventDate ? (
              <span className="ml-auto font-mono text-[10px] text-um-muted">
                Event date · {formatBackdate(eventDateParsed)}
              </span>
            ) : null}
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
              Rationale {kind === "custom" ? <span className="text-destructive">·  required</span> : "(optional)"}
            </span>
            <textarea
              rows={2}
              value={rationale}
              onChange={(e) => {
                setRationale(e.target.value);
                setStatus("idle");
              }}
              disabled={readOnly || pending}
              maxLength={1200}
              placeholder={
                kind === "custom"
                  ? "Custom backdate rationale — surfaces in NFP footer + pack section 5."
                  : "Optional notes — useful for D3 / D4 edge cases."
              }
              className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-foreground placeholder:text-um-muted disabled:opacity-60"
            />
          </label>

          {livePreview && livePreview.warnings.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-warn/40 bg-warn/5 px-2.5 py-1.5 font-mono text-[10.5px] text-warn">
              {livePreview.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-[1px] h-3 w-3 flex-shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="border-t border-border bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}
    </section>
  );
}

function StatusPill({
  status,
  pending,
  tier3Locked,
  persisted,
  warningsCount,
}: {
  status: SaveStatus;
  pending: boolean;
  tier3Locked: boolean;
  persisted: boolean;
  warningsCount: number;
}) {
  if (tier3Locked) {
    return (
      <span className="flex items-center gap-1.5 rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-destructive">
        Tier 3 · D-rule lock
      </span>
    );
  }
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
  if (persisted) {
    return (
      <span className="flex items-center gap-1.5 rounded-sm border border-success/35 bg-success/10 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-success">
        <Check className="h-3 w-3" />
        Backdate on file{warningsCount > 0 ? ` · ${warningsCount} warn` : ""}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-um-muted">
      Not set
    </span>
  );
}
