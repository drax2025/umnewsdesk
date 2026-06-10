"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { scoreUnscoredCandidates, type ScoreRunResult } from "@/lib/actions/score";

type Props = {
  unscoredCount: number;
};

export function ScoreButton({ unscoredCount }: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [tone, setTone] = useState<"info" | "error">("info");

  function run() {
    if (unscoredCount === 0) return;
    setMsg(null);
    startTransition(async () => {
      const res: ScoreRunResult = await scoreUnscoredCandidates();
      if (!res.ok) {
        setTone("error");
        setMsg(res.error);
        return;
      }
      setTone("info");
      const parts: string[] = [`Scored ${res.scored}`];
      if (res.failed > 0) parts.push(`${res.failed} failed`);
      if (res.remaining > 0) parts.push(`${res.remaining} left`);
      setMsg(parts.join(" · "));
    });
  }

  const label =
    unscoredCount === 0
      ? "All scored"
      : pending
        ? "Scoring…"
        : `Score ${unscoredCount} unscored`;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending || unscoredCount === 0}
        title="Run the Triage Scorecard (spec C0) against any candidates that don't yet have a score. Processes up to 20 per click."
        className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Sparkles className="h-3 w-3" />
        {label}
      </button>
      {msg ? (
        <span
          className={
            tone === "error"
              ? "text-[11px] text-destructive"
              : "text-[11px] text-um-muted"
          }
        >
          {msg}
        </span>
      ) : null}
    </div>
  );
}
