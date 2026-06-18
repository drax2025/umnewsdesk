"use client";

import { useState, useTransition } from "react";
import { Layers, ShieldX, ThumbsUp } from "lucide-react";
import {
  setPubVerdict,
  type PreFlightActionResult,
} from "@/lib/actions/pre-flight";
import { cn } from "@/lib/utils";

/**
 * Compact inline [PUB] verdict capture for the approvals queue. Renders a
 * notes textarea and three buttons. Used per-article on /approvals/pre-flight.
 */

const textareaCls =
  "min-h-[64px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

export function PubVerdictButtons({
  articleId,
  initialNotes = "",
}: {
  articleId: string;
  initialNotes?: string;
}) {
  const [notes, setNotes] = useState<string>(initialNotes);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function submit(verdict: "approve" | "modify" | "reject") {
    setError(null);
    setNotice(null);
    if (!notes.trim()) {
      setError("Notes are required for the Editor stamp.");
      return;
    }
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("pub_verdict", verdict);
    fd.set("pub_verdict_notes", notes);
    startTransition(async () => {
      const res: PreFlightActionResult = await setPubVerdict(fd);
      if (!res.ok) setError(res.error);
      else setNotice("Stamped.");
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Editor notes — APPROVE / MODIFY changes / REJECT reason."
        className={textareaCls}
        maxLength={2400}
      />
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={() => submit("approve")}
          disabled={pending}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md border border-success/45 bg-success/10 px-2.5 py-1.5 text-[11.5px] font-bold tracking-[0.04em] text-success hover:bg-success/15 disabled:opacity-50",
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          APPROVE
        </button>
        <button
          type="button"
          onClick={() => submit("modify")}
          disabled={pending}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md border border-warn/45 bg-warn/10 px-2.5 py-1.5 text-[11.5px] font-bold tracking-[0.04em] text-warn hover:bg-warn/15 disabled:opacity-50",
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          MODIFY
        </button>
        <button
          type="button"
          onClick={() => submit("reject")}
          disabled={pending}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md border border-destructive/45 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] font-bold tracking-[0.04em] text-destructive hover:bg-destructive/15 disabled:opacity-50",
          )}
        >
          <ShieldX className="h-3.5 w-3.5" />
          REJECT
        </button>
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
      {notice && !error ? (
        <p className="rounded-md border border-success/35 bg-success/10 px-2.5 py-1 text-[11px] text-success">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
