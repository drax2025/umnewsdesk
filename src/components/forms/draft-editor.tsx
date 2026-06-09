"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2, Save, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveArticleDraft } from "@/lib/actions/article-write";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  id: string;
  initialHeadline: string;
  initialStandfirst: string;
  initialBody: string;
  readOnly?: boolean;
};

export function DraftEditor({
  id,
  initialHeadline,
  initialStandfirst,
  initialBody,
  readOnly = false,
}: Props) {
  const [headline, setHeadline] = useState(initialHeadline);
  const [standfirst, setStandfirst] = useState(initialStandfirst);
  const [body, setBody] = useState(initialBody);
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baselineRef = useRef({
    headline: initialHeadline,
    standfirst: initialStandfirst,
    body: initialBody,
  });

  const isDirty =
    headline !== baselineRef.current.headline ||
    standfirst !== baselineRef.current.standfirst ||
    body !== baselineRef.current.body;

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const charCount = body.length;

  function doSave(summaryNote: string) {
    if (readOnly) return;
    if (!headline.trim()) {
      setStatus("error");
      return;
    }
    const fd = new FormData();
    fd.set("id", id);
    fd.set("headline", headline);
    fd.set("standfirst", standfirst);
    fd.set("body", body);
    if (summaryNote.trim()) fd.set("summary", summaryNote);

    setStatus("saving");
    startTransition(async () => {
      try {
        await saveArticleDraft(fd);
        baselineRef.current = { headline, standfirst, body };
        setSummary("");
        setStatus("saved");
        // Drop saved indicator after a beat
        setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2500);
      } catch {
        setStatus("error");
      }
    });
  }

  // Debounced autosave: 6 seconds after the last keystroke if dirty.
  useEffect(() => {
    if (readOnly) return;
    if (!isDirty) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => doSave(""), 6000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headline, standfirst, body]);

  return (
    <div className="flex flex-col gap-3">
      {/* Status strip */}
      <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-[11.5px]">
        <StatusPill status={status} dirty={isDirty} pending={isPending} />
        <span className="font-mono text-[10.5px] tabular-nums text-um-muted">
          {wordCount} words · {charCount} chars
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Optional change note (for revision history)"
            disabled={readOnly}
            className="h-7 w-[260px] rounded-sm border border-border-mid bg-background px-2 text-[11px] text-foreground placeholder:text-um-muted disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => doSave(summary)}
            disabled={readOnly || !isDirty || isPending}
            className={cn(
              "flex h-7 items-center gap-1 rounded-sm border px-2.5 text-[11px] font-medium transition-colors",
              isDirty && !readOnly && !isPending
                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                : "border-border bg-background text-um-muted",
            )}
          >
            <Save className="h-3 w-3" />
            Save now
          </button>
        </div>
      </div>

      {/* Headline */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Headline
        </label>
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          disabled={readOnly}
          className="w-full rounded-md border border-border-mid bg-background px-3 py-2 text-[16px] font-semibold leading-[1.3] text-foreground disabled:opacity-60"
        />
      </div>

      {/* Standfirst */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Standfirst
        </label>
        <textarea
          rows={2}
          value={standfirst}
          onChange={(e) => setStandfirst(e.target.value)}
          disabled={readOnly}
          placeholder="A one or two-sentence summary that sells the story."
          className="w-full resize-y rounded-md border border-border-mid bg-background px-3 py-2 text-[13px] leading-[1.5] text-foreground placeholder:text-um-muted disabled:opacity-60"
        />
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Body
        </label>
        <textarea
          rows={22}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={readOnly}
          placeholder="Write the story. Markdown supported. Autosaves 6s after you stop typing."
          className="w-full resize-y rounded-md border border-border-mid bg-background px-3 py-3 font-mono text-[13px] leading-[1.6] text-foreground placeholder:text-um-muted disabled:opacity-60"
        />
      </div>

      {readOnly ? (
        <div className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/8 px-3 py-2 text-[11.5px] text-warn">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            This article is past the writer-edit gate. Open the approvals queue
            to record a decision instead.
          </span>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({
  status,
  dirty,
  pending,
}: {
  status: SaveStatus;
  dirty: boolean;
  pending: boolean;
}) {
  if (pending || status === "saving") {
    return (
      <span className="flex items-center gap-1.5 rounded-sm border border-warn/35 bg-warn/10 px-1.5 py-0.5 text-[10.5px] font-medium text-warn">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 rounded-sm border border-destructive/35 bg-destructive/10 px-1.5 py-0.5 text-[10.5px] font-medium text-destructive">
        <AlertTriangle className="h-3 w-3" />
        Save failed
      </span>
    );
  }
  if (status === "saved" && !dirty) {
    return (
      <span className="flex items-center gap-1.5 rounded-sm border border-success/35 bg-success/10 px-1.5 py-0.5 text-[10.5px] font-medium text-success">
        <Check className="h-3 w-3" />
        Saved
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="flex items-center gap-1.5 rounded-sm border border-warn/35 bg-warn/10 px-1.5 py-0.5 text-[10.5px] font-medium text-warn">
        <span className="h-1.5 w-1.5 rounded-full bg-warn" />
        Unsaved
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-1.5 py-0.5 text-[10.5px] font-medium text-um-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-um-muted" />
      Idle
    </span>
  );
}
