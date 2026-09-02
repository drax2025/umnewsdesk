"use client";

import { useState, useTransition } from "react";
import { Send, Check, AlertTriangle } from "lucide-react";
import { sendToNewsroom, type HandoffResult } from "@/lib/actions/newsroom-handoff";

/**
 * Hands one candidate to the newsroom.
 *
 * A candidate already sent shows where it went rather than offering the button
 * again — the newsroom would treat a repeat as a duplicate and change nothing,
 * but the desk should not have to find that out by clicking.
 *
 * A blocked candidate says why. The reasons are things a person can act on: no
 * source URL, no article text, marked as a duplicate.
 */
type Props = {
  candidateId: string;
  /** Set when this candidate has already gone, so the button becomes a receipt. */
  sentRecordId?: string | null;
  /** Last failure, if the previous attempt did not get through. */
  lastError?: string | null;
};

export function SendToNewsroomButton({ candidateId, sentRecordId, lastError }: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<HandoffResult | null>(null);

  const sent = result?.ok ? result : sentRecordId ? { ok: true as const, recordId: sentRecordId, workflowId: "", duplicate: true } : null;
  const failed = result && !result.ok ? result.error : lastError || null;

  function run() {
    setResult(null);
    startTransition(async () => setResult(await sendToNewsroom(candidateId)));
  }

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
            title={`In the newsroom as ${sent.recordId}`}>
        <Check size={13} />
        In newsroom · {sent.recordId}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      >
        <Send size={13} />
        {pending ? "Sending…" : "Send to newsroom"}
      </button>
      {failed && (
        <span className="inline-flex items-start gap-1 text-[11px] leading-snug text-red-700 dark:text-red-400">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          {failed}
        </span>
      )}
    </div>
  );
}
