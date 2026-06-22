"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Loader2,
  Save,
  ShieldX,
  Shield,
  Wand2,
  XCircle,
} from "lucide-react";
import {
  ARTEFACT_OUTLET_LABEL,
  ARTEFACT_SWEEP_STATUS,
  artefactsByOutlet,
  noteForArtefact,
  statusForArtefact,
  summariseSweep,
  type ArtefactOutlet,
  type ArtefactSweepStatus,
  type ArticleArtefactSweepRow,
  type ArtefactDef,
} from "@/lib/spec/f8-publish";
import {
  bulkStampArtefactSweep,
  saveArtefactRow,
} from "@/lib/actions/publish";
import type { PublishActionResult } from "@/lib/actions/publish";
import { cn } from "@/lib/utils";

/**
 * F8 Stage 1 — final B2 17-artefact sweep, grouped by outlet (DIGIT /
 * Futurescot / SFN). Header roll-up shows live counts; publish is blocked
 * upstream until cleanForPush is true.
 */

const STATUS_ICON: Record<
  ArtefactSweepStatus,
  React.ComponentType<{ className?: string }>
> = {
  pending: CircleDashed,
  swept_clean: CheckCircle2,
  contamination_found: XCircle,
  na: ShieldX,
};

type Props = {
  articleId: string;
  row: ArticleArtefactSweepRow | null;
  readOnly?: boolean;
};

export function ArtefactSweepPanel({
  articleId,
  row,
  readOnly = false,
}: Props) {
  const summary = summariseSweep(row);
  // Bumped after a bulk stamp so the per-row client state is thrown away and
  // re-initialised from the freshly-revalidated `row` prop. Without this the
  // 17 individual rows would keep their stale local `status` after the bulk
  // action completes.
  const [version, setVersion] = useState(0);
  // Artefacts roll up by default — the header summary carries the at-a-glance
  // counts, and the editor expands to action individual rows. Keeps the F8 page
  // scannable when 17 rows are clean and nothing needs touching.
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-background/40 px-3 py-2">
        <Shield className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          F8 final B2 sweep · 17 prohibited artefacts
        </h2>
        <span className="ml-auto font-mono text-[10.5px] text-um-muted">
          {summary.clean} clean · {summary.found} found · {summary.na} N/A ·{" "}
          {summary.pending} pending
        </span>
        {summary.cleanForPush ? (
          <span className="flex items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-success">
            <CheckCircle2 className="h-3 w-3" />
            ready for push
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-warn">
            <AlertTriangle className="h-3 w-3" />
            sweep blocked
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex h-6 items-center gap-1 rounded-sm border border-border bg-background px-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-fg-2 transition-colors hover:bg-secondary"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {expanded ? "Hide artefacts" : "View artefacts"}
        </button>
      </header>

      {expanded ? (
        <>
          <p className="border-b border-border bg-background/30 px-3 py-2 text-[10.5px] leading-[1.5] text-um-muted">
            DIGIT, Futurescot and SFN are <strong>signal-only</strong>. F8
            confirms none of the 17 prohibited artefacts have slipped past F7
            before WordPress push. Any contamination_found row blocks publish;
            any pending or unjustified N/A row blocks publish.
          </p>

          <BulkStampToolbar
            articleId={articleId}
            pendingCount={summary.pending}
            readOnly={readOnly}
            onComplete={() => setVersion((v) => v + 1)}
          />

          {(["digit", "futurescot", "sfn"] as ArtefactOutlet[]).map((outlet) => (
            <OutletBlock
              key={`${outlet}:${version}`}
              outlet={outlet}
              defs={artefactsByOutlet(outlet)}
              row={row}
              articleId={articleId}
              readOnly={readOnly}
            />
          ))}
        </>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Bulk stamp toolbar — Tier 1 press-release fast path                       */
/* -------------------------------------------------------------------------- */

function BulkStampToolbar({
  articleId,
  pendingCount,
  readOnly,
  onComplete,
}: {
  articleId: string;
  pendingCount: number;
  readOnly: boolean;
  onComplete: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "na">("idle");
  const [reason, setReason] = useState("");
  const [pendingAction, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastStamped, setLastStamped] = useState<number | null>(null);

  if (readOnly) return null;
  if (pendingCount === 0) return null;

  function stamp(status: "swept_clean" | "na") {
    setError(null);
    if (status === "na" && reason.trim().length === 0) {
      setError("Reason is required when stamping N/A in bulk.");
      return;
    }

    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("status", status);
    if (status === "na") fd.set("reason", reason.trim());

    startTransition(async () => {
      const res = await bulkStampArtefactSweep(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLastStamped(res.stamped);
      setMode("idle");
      setReason("");
      onComplete();
      setTimeout(() => setLastStamped(null), 2800);
    });
  }

  return (
    <div className="space-y-2 border-b border-border bg-background/20 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          <Wand2 className="h-3 w-3" />
          Bulk · {pendingCount} pending
        </span>
        <button
          type="button"
          onClick={() => stamp("swept_clean")}
          disabled={pendingAction || mode === "na"}
          className="flex h-7 items-center gap-1 rounded-md border border-success/45 bg-success/10 px-2 text-[11px] font-medium text-success transition-colors hover:bg-success/15 disabled:opacity-50"
        >
          {pendingAction && mode !== "na" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3 w-3" />
          )}
          Stamp all pending as Clean
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "na" ? "idle" : "na");
            setError(null);
          }}
          disabled={pendingAction}
          className={cn(
            "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-50",
            mode === "na"
              ? "border-warn/55 bg-warn/15 text-warn"
              : "border-warn/45 bg-warn/10 text-warn hover:bg-warn/15",
          )}
        >
          <ShieldX className="h-3 w-3" />
          Stamp all pending as N/A…
        </button>
        {lastStamped !== null ? (
          <span className="flex items-center gap-1 font-mono text-[10px] text-success">
            <CheckCircle2 className="h-3 w-3" />
            stamped {lastStamped}
          </span>
        ) : null}
      </div>

      {mode === "na" ? (
        <div className="space-y-1.5">
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            placeholder="Reason that applies to every pending artefact (e.g. 'Tier 1 press release — no exposure to DIGIT / Futurescot / SFN; sources are the issuing body's own release and verified primaries'). Required."
            maxLength={2400}
            disabled={pendingAction}
            className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-foreground placeholder:text-um-muted disabled:opacity-60"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => stamp("na")}
              disabled={pendingAction}
              className="flex h-7 items-center gap-1 rounded-md border border-warn/45 bg-warn/10 px-2 text-[11px] font-medium text-warn hover:bg-warn/15 disabled:opacity-50"
            >
              {pendingAction ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ShieldX className="h-3 w-3" />
              )}
              Confirm bulk N/A
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setReason("");
                setError(null);
              }}
              disabled={pendingAction}
              className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}

      <p className="text-[10px] leading-[1.45] text-um-muted">
        Bulk only fills the {pendingCount} pending row
        {pendingCount === 1 ? "" : "s"} — rows already stamped Clean, Found, or
        N/A are left as-is. After bulk, you can still flip individual rows to
        contamination_found if exposure is discovered.
      </p>
    </div>
  );
}

function OutletBlock({
  outlet,
  defs,
  row,
  articleId,
  readOnly,
}: {
  outlet: ArtefactOutlet;
  defs: ArtefactDef[];
  row: ArticleArtefactSweepRow | null;
  articleId: string;
  readOnly: boolean;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="bg-background/30 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-2">
        {ARTEFACT_OUTLET_LABEL[outlet]} · {defs.length} artefact
        {defs.length === 1 ? "" : "s"}
      </div>
      <div className="divide-y divide-border">
        {defs.map((def) => (
          <ArtefactRow
            key={def.code}
            articleId={articleId}
            def={def}
            initialStatus={statusForArtefact(row?.results ?? null, def.code)}
            initialNote={noteForArtefact(row?.results ?? null, def.code)}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

function ArtefactRow({
  articleId,
  def,
  initialStatus,
  initialNote,
  readOnly,
}: {
  articleId: string;
  def: ArtefactDef;
  initialStatus: ArtefactSweepStatus;
  initialNote: string | null;
  readOnly: boolean;
}) {
  const [status, setStatus] = useState<ArtefactSweepStatus>(initialStatus);
  const [note, setNote] = useState<string>(initialNote ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const needsNote =
    (status === "contamination_found" || status === "na") &&
    note.trim().length === 0;

  function save() {
    if (readOnly) return;
    setError(null);
    if (needsNote) {
      setError(
        status === "contamination_found"
          ? "Contamination found — describe what."
          : "N/A — record why this artefact does not apply.",
      );
      return;
    }
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("code", def.code);
    fd.set("status", status);
    fd.set("note", note);

    startTransition(async () => {
      const res: PublishActionResult = await saveArtefactRow(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    });
  }

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-2">
          {def.code}
        </span>
        <span className="text-[12.5px] font-medium text-foreground">
          {def.label}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {saved ? (
            <span className="flex items-center gap-1 font-mono text-[10px] text-success">
              <CheckCircle2 className="h-3 w-3" />
              saved
            </span>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="flex h-7 items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-[10.5px] leading-[1.45] text-um-muted">
        {def.description}
      </p>

      <div className="flex flex-wrap gap-1">
        {ARTEFACT_SWEEP_STATUS.map((s) => {
          const Icon = STATUS_ICON[s.value];
          const active = status === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => {
                setStatus(s.value);
                setError(null);
              }}
              disabled={readOnly || pending}
              className={cn(
                "flex h-7 items-center gap-1 rounded-md border px-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] transition-colors disabled:opacity-50",
                active
                  ? s.tone === "success"
                    ? "border-success/45 bg-success/10 text-success"
                    : s.tone === "destructive"
                      ? "border-destructive/45 bg-destructive/10 text-destructive"
                      : s.tone === "warn"
                        ? "border-warn/45 bg-warn/10 text-warn"
                        : "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-fg-2 hover:bg-secondary",
              )}
            >
              <Icon className="h-3 w-3" />
              {s.short}
            </button>
          );
        })}
      </div>

      <textarea
        rows={2}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setError(null);
        }}
        disabled={readOnly || pending}
        placeholder={
          status === "contamination_found"
            ? "What exactly was found? (required — auto-routed to pack §0)"
            : status === "na"
              ? "Why does this artefact not apply? (required)"
              : "Optional one-line note."
        }
        maxLength={2400}
        className={cn(
          "w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-foreground placeholder:text-um-muted disabled:opacity-60",
          needsNote ? "border-destructive/40" : "border-border",
        )}
      />

      {error ? (
        <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
