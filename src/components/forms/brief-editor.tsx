"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { draftBriefFromSource, type BriefDraftResult } from "@/lib/actions/brief";
import { updateCommissionBrief } from "@/lib/actions/commissioning";

type Props = {
  commissionId: string;
  initialBrief: string;
  initialDeadlineLocal: string;
  hasSourceCandidate: boolean;
};

export function BriefEditor({
  commissionId,
  initialBrief,
  initialDeadlineLocal,
  hasSourceCandidate,
}: Props) {
  const [brief, setBrief] = useState(initialBrief);
  const [deadline, setDeadline] = useState(initialDeadlineLocal);
  const [savePending, startSave] = useTransition();
  const [draftPending, startDraft] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("id", commissionId);
    fd.set("brief", brief);
    fd.set("deadline_at", deadline);
    startSave(async () => {
      await updateCommissionBrief(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    });
  }

  function draft() {
    if (!hasSourceCandidate) return;
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("commission_id", commissionId);
    startDraft(async () => {
      const res: BriefDraftResult = await draftBriefFromSource(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBrief(res.draft);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 flex items-center justify-between gap-3">
          <label
            htmlFor={`brief-${commissionId}`}
            className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted"
          >
            Brief
          </label>
          <button
            type="button"
            onClick={draft}
            disabled={draftPending || !hasSourceCandidate}
            title={
              hasSourceCandidate
                ? "Generate a structured brief from the source candidate via Claude"
                : "No source candidate linked to this commission"
            }
            className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-primary/35 bg-primary/10 px-2 text-[10.5px] font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />
            {draftPending ? "Drafting…" : "Draft from source"}
          </button>
        </div>
        <textarea
          id={`brief-${commissionId}`}
          value={brief}
          onChange={(e) => setBrief(e.currentTarget.value)}
          rows={10}
          disabled={draftPending}
          placeholder="Word count, angle, key sources, deadline expectations…"
          className="w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-[11.5px] leading-[1.55] text-foreground focus:border-primary focus:outline-none disabled:opacity-60"
        />
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label
            htmlFor={`deadline-${commissionId}`}
            className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted"
          >
            Deadline
          </label>
          <input
            id={`deadline-${commissionId}`}
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.currentTarget.value)}
            className="h-8 w-full rounded-sm border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={save}
          disabled={savePending}
          className="h-8 rounded-sm border border-primary/40 bg-primary/10 px-3 text-[11.5px] font-medium text-primary hover:bg-primary/15 disabled:opacity-60"
        >
          {savePending ? "Saving…" : saved ? "Saved" : "Save brief"}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
