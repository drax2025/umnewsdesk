"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { addManualCandidate, type ManualCandidateResult } from "@/lib/actions/manual-candidate";
import { cn } from "@/lib/utils";

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const labelCls = "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";

export type SourceOption = { id: string; name: string; code: string };

/** Local time in the shape datetime-local wants: YYYY-MM-DDTHH:mm. */
function nowForInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AddCandidateButton({ sources }: { sources: SourceOption[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-state-comm/35 bg-state-comm/10 px-2.5 text-[11.5px] font-medium text-state-comm hover:bg-state-comm/15"
      >
        <Plus className="h-3.5 w-3.5" />
        Add story
      </button>
      <dialog
        ref={ref}
        className="w-[min(30rem,92vw)] rounded-lg border border-border bg-card p-0 text-foreground backdrop:bg-black/50"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-[13px] font-semibold">Add a story by hand</span>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="text-um-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-3.5">
          <AddCandidateForm sources={sources} onDone={() => ref.current?.close()} />
        </div>
      </dialog>
    </>
  );
}

function AddCandidateForm({ sources, onDone }: { sources: SourceOption[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // "Added by hand" unless the desk knows better.
  const manual = sources.find((s) => s.code === "MANUAL");

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res: ManualCandidateResult = await addManualCandidate(fd);
      if (!res.ok) { setError(res.error); return; }
      // Left open with the code shown: filing one story usually means filing
      // three, and reopening the dialog each time is the annoying part.
      setAdded(res.code);
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-col gap-3">
      <div>
        <label className={labelCls} htmlFor="mc-headline">Working headline</label>
        <input
          id="mc-headline" name="working_headline" required minLength={4}
          placeholder="What is the story?"
          className={cn(inputCls, "mt-1")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="mc-source">Source</label>
          <select id="mc-source" name="source_id" required defaultValue={manual?.id ?? ""} className={cn(inputCls, "mt-1")}>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="mc-when">Date and time</label>
          <input
            id="mc-when" name="surfaced_at" type="datetime-local" required
            defaultValue={nowForInput()}
            className={cn(inputCls, "mt-1")}
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="mc-url">Link <span className="font-normal normal-case">— optional</span></label>
        <input
          id="mc-url" name="primary_url" placeholder="https://…"
          className={cn(inputCls, "mt-1 font-mono text-[11.5px]")}
        />
        <p className="mt-1 text-[10.5px] text-um-muted">
          Worth adding where there is one: it is how the desk spots the same story
          arriving twice, and what the newsroom needs on hand-off.
        </p>
      </div>

      <div>
        <label className={labelCls} htmlFor="mc-note">Note <span className="font-normal normal-case">— optional</span></label>
        <input id="mc-note" name="note" placeholder="Where it came from, why it matters" className={cn(inputCls, "mt-1")} />
      </div>

      {error ? <p className="text-[11.5px] text-danger">{error}</p> : null}
      {added ? (
        <p className="text-[11.5px] text-success">Added as {added}. Add another, or close.</p>
      ) : null}

      <div className="mt-1 flex items-center justify-end gap-2">
        <button
          type="button" onClick={onDone}
          className="h-7 rounded-md border border-border bg-transparent px-2.5 text-[11.5px] text-fg-2 hover:bg-secondary"
        >
          {added ? "Done" : "Cancel"}
        </button>
        <button
          type="submit" disabled={pending}
          className="h-7 rounded-md border border-state-comm/35 bg-state-comm/10 px-2.5 text-[11.5px] font-medium text-state-comm hover:bg-state-comm/15 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add to inbox"}
        </button>
      </div>
    </form>
  );
}
