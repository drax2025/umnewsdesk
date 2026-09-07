"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { REJECTION_REASONS, validateRejection } from "@/lib/spec/rejection";
import { rejectCandidate, rejectCandidates } from "@/lib/actions/reject";

/**
 * Closing a candidate, with the reason it was closed.
 *
 * Submit stays disabled until the form is valid, so the "why" cannot be skipped
 * by clicking through — which is the entire point of the reason being
 * mandatory.
 *
 * In bulk the stories are **listed, not counted**. "Reject 43 stories" is a
 * number; seeing the headlines is what stops somebody clearing work that should
 * have been done. It is the only safeguard on the operation, and deliberately so.
 */

type Target = { id: string; headline: string };

export function RejectDialog({
  targets,
  onClose,
  onDone,
}: {
  targets: Target[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No reset effect: callers mount this only while open, so every opening is a
  // fresh component and the form starts empty by construction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const bulk = targets.length > 1;
  const invalid = validateRejection(reason, note);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = bulk
      ? await rejectCandidates(targets.map((t) => t.id), reason, note)
      : await rejectCandidate(targets[0].id, reason, note);
    if (res.ok) {
      onDone?.();
      onClose();
      router.refresh();
    } else {
      // A partial bulk failure is reported as it happened rather than smoothed
      // over: some of these really are rejected now.
      setError(res.error);
      setBusy(false);
      if (res.rejected > 0) router.refresh();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 cursor-default bg-black/50"
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-[520px] flex-col rounded-lg border border-border bg-card shadow-2xl">
        <header className="flex items-start gap-2 border-b border-border px-4 py-3">
          <Ban className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13.5px] font-semibold text-foreground">
              {bulk ? `Reject ${targets.length} candidates` : "Reject this candidate"}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-um-muted">
              This is terminal — it leaves the inbox and there is no undo here.
              Nothing is deleted and no one is emailed.
            </p>
          </div>
          <button type="button" onClick={() => !busy && onClose()} className="rounded-sm border border-border p-1 text-um-muted hover:bg-secondary hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {bulk ? (
            <section className="mb-3">
              <Label>These stories</Label>
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-sm border border-border bg-background px-2 py-1.5">
                {targets.map((t) => (
                  <li key={t.id} className="truncate py-0.5 text-[11.5px] text-fg-2" title={t.headline}>
                    {t.headline}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="mb-3 truncate text-[12.5px] font-medium text-foreground" title={targets[0]?.headline}>
              {targets[0]?.headline}
            </p>
          )}

          <Label htmlFor="reject-reason">Reason (required)</Label>
          <select
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            className="mt-1 h-8 w-full rounded-sm border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">Choose a reason…</option>
            {REJECTION_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <Label htmlFor="reject-note" className="mt-3 block">
            Note {reason === "Other" ? "(required)" : "(optional)"}
          </Label>
          <textarea
            id="reject-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            rows={3}
            placeholder={reason === "Other" ? "Say why — this is the escape hatch, so it has to say something." : "Anything worth knowing in six weeks."}
            className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[12px] text-foreground placeholder:text-um-muted focus:border-primary focus:outline-none"
          />

          {error ? (
            <p className="mt-3 rounded-sm border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11.5px] text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={onClose} disabled={busy} className="h-7 rounded-sm border border-border bg-background px-3 text-[11.5px] text-fg-2 hover:bg-secondary disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!!invalid || busy}
            title={invalid ?? undefined}
            className={cn(
              "h-7 rounded-sm border px-3 text-[11.5px] font-medium transition-colors",
              invalid || busy
                ? "cursor-not-allowed border-border bg-background text-um-muted"
                : "border-destructive/45 bg-destructive/15 text-destructive hover:bg-destructive/25",
            )}
          >
            {busy ? "Rejecting…" : bulk ? `Reject ${targets.length}` : "Reject"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Label({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted", className)}>
      {children}
    </label>
  );
}

/** The row action. */
export function RejectButton({ candidateId, headline }: { candidateId: string; headline: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Close this candidate with a reason. Terminal — nothing is deleted, no one is emailed."
        className="h-6 rounded-sm border border-border bg-background px-2 text-[10.5px] font-medium text-fg-2 transition-colors hover:border-destructive/45 hover:bg-destructive/10 hover:text-destructive"
      >
        Reject
      </button>
      {open ? (
        <RejectDialog
          targets={[{ id: candidateId, headline }]}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
