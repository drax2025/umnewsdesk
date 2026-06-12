"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Pause, Sparkles, XCircle } from "lucide-react";
import {
  REJECT_SWEEP_VERDICTS,
  type RejectQueueSweepRow,
  type RejectSweepVerdict,
} from "@/lib/spec/a3-opportunities";
import {
  setRejectSweepVerdict,
  type OpportunityActionResult,
} from "@/lib/actions/opportunities";
import { cn } from "@/lib/utils";

const ICON: Record<
  RejectSweepVerdict,
  React.ComponentType<{ className?: string }>
> = {
  pursue_manual: Sparkles,
  hold: Pause,
  drop: XCircle,
};

export function K5RejectSweepPanel({
  articleId,
  latest,
  history,
}: {
  articleId: string;
  latest: RejectQueueSweepRow | null;
  history: RejectQueueSweepRow[];
}) {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function stamp(v: RejectSweepVerdict) {
    setError(null);
    setSaved(false);
    if ((v === "drop" || v === "hold") && !notes.trim()) {
      setError(
        v === "drop"
          ? "Drop needs a note for the K5 audit trail."
          : "Hold needs a note (why holding, when to revisit).",
      );
      return;
    }
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("verdict", v);
    fd.set("notes", notes);
    startTransition(async () => {
      const res: OpportunityActionResult = await setRejectSweepVerdict(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setNotes("");
      setTimeout(() => setSaved(false), 2200);
    });
  }

  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-border bg-background/40 px-2.5 py-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-um-muted">
          K5 sweep
        </span>
        {latest ? (
          <span className="font-mono text-[10.5px] text-fg-2">
            last: {latest.verdict} · iter {latest.iteration}
            {latest.swept_at
              ? ` · ${new Date(latest.swept_at).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}`
              : ""}
          </span>
        ) : (
          <span className="font-mono text-[10.5px] text-um-muted">
            no sweep yet
          </span>
        )}
        {history.length > 1 ? (
          <span className="ml-auto font-mono text-[10.5px] text-um-muted">
            {history.length} prior sweeps
          </span>
        ) : null}
      </div>

      {latest?.notes ? (
        <p className="rounded-sm bg-secondary/40 px-2 py-1 text-[11px] leading-[1.45] text-fg-2">
          {latest.notes}
        </p>
      ) : null}

      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setError(null);
        }}
        rows={2}
        placeholder="Sweep note (required for HOLD / DROP — K5 audit trail)."
        maxLength={1200}
        className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-[11.5px] leading-[1.45] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
      />

      <div className="flex flex-wrap gap-1.5">
        {REJECT_SWEEP_VERDICTS.map((v) => {
          const Icon = ICON[v.value];
          return (
            <button
              key={v.value}
              type="button"
              onClick={() => stamp(v.value)}
              disabled={pending}
              title={v.description}
              className={cn(
                "flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium disabled:opacity-50",
                v.tone === "success"
                  ? "border-success/45 bg-success/10 text-success hover:bg-success/15"
                  : v.tone === "warn"
                    ? "border-warn/45 bg-warn/10 text-warn hover:bg-warn/15"
                    : "border-destructive/45 bg-destructive/10 text-destructive hover:bg-destructive/15",
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
        })}
        {saved ? (
          <span className="flex items-center gap-1 text-[10.5px] text-success">
            <CheckCircle2 className="h-3 w-3" />
            saved
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
