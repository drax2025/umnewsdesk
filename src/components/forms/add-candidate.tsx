"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
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

/**
 * The default time, filled in on the client only.
 *
 * Rendering it during SSR is a guaranteed hydration mismatch: Vercel runs in
 * UTC and the desk is in London, so the server writes 08:35 and the browser
 * expects 09:35. Same footgun the topbar clock documents at length — hence the
 * same answer, useSyncExternalStore with a server snapshot that commits to
 * nothing. The action treats an empty value as "now", so a form submitted
 * before hydration is still correct.
 */
const noSubscribe = () => () => {};
const clientNow = () => nowForInput();
const serverNow = () => "";

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
        className="fixed inset-0 m-auto h-fit w-[520px] max-w-[92vw] rounded-lg border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/40 backdrop:backdrop-blur-sm"
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
  const defaultWhen = useSyncExternalStore(noSubscribe, clientNow, serverNow);

  // "Added by hand" unless the desk knows better.
  const manual = sources.find((s) => s.code === "MANUAL");

  /**
   * Submitted by hand rather than through `<form action={…}>`.
   *
   * The action form never fired: no POST ever reached the server, while the
   * dialog opened and closed normally — so the component was hydrated and
   * interactive, and only the form wiring was inert. Reading the form directly
   * removes the mechanism that was failing, and lets an invalid field say so
   * through reportValidity() instead of a bubble nobody sees inside a modal.
   */
  function submit() {
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;
    const fd = new FormData(form);

    // datetime-local hands back a naive "2026-09-16T10:31" with no zone. The
    // browser means that in the reader's time; the server would parse it in
    // its own, and Vercel runs UTC — so 10:31 BST arrived as 10:31 UTC, an
    // hour in the future, and was refused. Converted here, where the local
    // zone is actually known, so the server only ever sees an instant.
    const when = String(fd.get("surfaced_at") ?? "").trim();
    if (when) {
      const local = new Date(when);
      if (Number.isNaN(local.getTime())) {
        setError("That date and time could not be read");
        return;
      }
      fd.set("surfaced_at", local.toISOString());
    }

    setError(null);
    startTransition(async () => {
      let res: ManualCandidateResult;
      try {
        res = await addManualCandidate(fd);
      } catch (e) {
        // A server action that throws rejects here, and an unhandled rejection
        // inside a transition is swallowed in production — the form goes quiet
        // and the story is never filed. Which is exactly what happened.
        setError((e as Error)?.message ?? "Could not reach the server");
        return;
      }
      if (!res.ok) { setError(res.error); return; }
      // Left open with the code shown: filing one story usually means filing
      // three, and reopening the dialog each time is the annoying part.
      setAdded(res.code);
      formRef.current?.reset();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="flex flex-col gap-3"
    >
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
            id="mc-when" name="surfaced_at" type="datetime-local"
            defaultValue={defaultWhen}
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
        <label className={labelCls} htmlFor="mc-body">
          Story text <span className="font-normal normal-case">— optional, but needed to send it on</span>
        </label>
        <textarea
          id="mc-body"
          name="body_text"
          rows={5}
          placeholder="Paste the story, or write what you know…"
          className={cn(
            inputCls,
            "mt-1 h-auto resize-y py-1.5 leading-[1.45]",
          )}
        />
        <p className="mt-1 text-[10.5px] text-um-muted">
          The newsroom will not take a headline and a link — it needs a paragraph
          at least. File it without if you are capturing the story now and
          writing it up later.
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
          type="button"
          onClick={submit}
          disabled={pending}
          className="h-7 rounded-md border border-state-comm/35 bg-state-comm/10 px-2.5 text-[11.5px] font-medium text-state-comm hover:bg-state-comm/15 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add to inbox"}
        </button>
      </div>
    </form>
  );
}
