"use client";

import { useState, useTransition } from "react";
import { dismissCrmMatch, resolveCrmMatch } from "@/lib/actions/crm-queue";

/**
 * Clearing one queue entry. Neither button writes to the CRM — the record is
 * made there by a person, and this only takes the reminder off the list.
 */
export function CrmQueueActions({ id, canManage }: { id: number; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return null;

  const run = (fn: (id: number) => Promise<{ ok: boolean; error?: string }>) => () =>
    startTransition(async () => {
      const r = await fn(id);
      setError(r.ok ? null : (r.error ?? "Could not update the queue"));
    });

  return (
    <div className="flex items-center justify-end gap-1.5">
      {error ? <span className="text-[10.5px] text-danger">{error}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={run(resolveCrmMatch)}
        title="I have made or corrected the record in the CRM"
        className="inline-flex h-6 items-center rounded-md border border-success/35 bg-success/10 px-2 text-[11px] font-medium text-success hover:bg-success/15 disabled:opacity-50"
      >
        Done
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={run(dismissCrmMatch)}
        title="Not an agency — no record needed"
        className="inline-flex h-6 items-center rounded-md border border-border bg-secondary px-2 text-[11px] font-medium text-fg-2 hover:bg-secondary/70 disabled:opacity-50"
      >
        Not an agency
      </button>
    </div>
  );
}
