"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { draftBriefFromSource, type BriefDraftResult } from "@/lib/actions/brief";
import { updateCommissionBrief } from "@/lib/actions/commissioning";
import {
  DEFAULT_PROMPT_KEY,
  PROMPT_LIBRARY,
  type FramingBrief,
} from "@/lib/prompts/registry";

type Props = {
  commissionId: string;
  initialBrief: string;
  initialDeadlineLocal: string;
  initialFraming: FramingBrief | null;
  hasSourceCandidate: boolean;
};

const GEO_LABEL: Record<string, string> = {
  scottish_origin: "Scottish-origin",
  uk_origin: "UK-origin",
  global_origin: "Global-origin",
};

export function BriefEditor({
  commissionId,
  initialBrief,
  initialDeadlineLocal,
  initialFraming,
  hasSourceCandidate,
}: Props) {
  const [brief, setBrief] = useState(initialBrief);
  const [deadline, setDeadline] = useState(initialDeadlineLocal);
  const [framing, setFraming] = useState<FramingBrief | null>(initialFraming);
  const [promptKey, setPromptKey] = useState(DEFAULT_PROMPT_KEY);
  const [savePending, startSave] = useTransition();
  const [draftPending, startDraft] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const selectedPrompt = PROMPT_LIBRARY.find((p) => p.key === promptKey) ?? PROMPT_LIBRARY[0];

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("id", commissionId);
    fd.set("brief", brief);
    fd.set("deadline_at", deadline);
    fd.set("framing_brief", framing ? JSON.stringify(framing) : "");
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
    fd.set("prompt_key", promptKey);
    startDraft(async () => {
      const res: BriefDraftResult = await draftBriefFromSource(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.kind === "commissioning") {
        setBrief(res.text);
      } else {
        setFraming(res.framing);
      }
    });
  }

  function clearFraming() {
    setFraming(null);
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
          <div className="flex items-center gap-1.5">
            <select
              value={promptKey}
              onChange={(e) => setPromptKey(e.currentTarget.value)}
              disabled={draftPending}
              title={selectedPrompt.description}
              className="h-6 rounded-sm border border-border bg-background px-1.5 text-[10.5px] text-foreground focus:border-primary focus:outline-none disabled:opacity-60"
            >
              {PROMPT_LIBRARY.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={draft}
              disabled={draftPending || !hasSourceCandidate}
              title={
                hasSourceCandidate
                  ? `Generate via Claude using the "${selectedPrompt.label}" prompt`
                  : "No source candidate linked to this commission"
              }
              className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-primary/35 bg-primary/10 px-2 text-[10.5px] font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" />
              {draftPending ? "Drafting…" : "Draft"}
            </button>
          </div>
        </div>
        <textarea
          id={`brief-${commissionId}`}
          value={brief}
          onChange={(e) => setBrief(e.currentTarget.value)}
          rows={10}
          disabled={draftPending && selectedPrompt.kind === "commissioning"}
          placeholder="Word count, angle, key sources, deadline expectations…"
          className="w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-[11.5px] leading-[1.55] text-foreground focus:border-primary focus:outline-none disabled:opacity-60"
        />
      </div>

      <FramingPanel
        framing={framing}
        pending={draftPending && selectedPrompt.kind === "framing"}
        onClear={clearFraming}
      />

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

function FramingPanel({
  framing,
  pending,
  onClear,
}: {
  framing: FramingBrief | null;
  pending: boolean;
  onClear: () => void;
}) {
  if (!framing && !pending) {
    return (
      <div className="rounded-sm border border-dashed border-border bg-background/40 px-3 py-2 text-[11px] text-um-muted">
        <span className="font-semibold text-fg-2">Framing brief</span> — empty.
        Pick &ldquo;Framing brief (spec P2)&rdquo; from the dropdown above and
        click Draft to generate one. Save persists it with the brief.
      </div>
    );
  }

  if (pending && !framing) {
    return (
      <div className="rounded-sm border border-border bg-background px-3 py-2 text-[11px] text-um-muted">
        Generating framing brief…
      </div>
    );
  }

  const f = framing!;
  if (f.disqualified) {
    return (
      <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11.5px]">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-destructive">
            Framing brief · disqualified
          </span>
          <button
            type="button"
            onClick={onClear}
            className="text-[10.5px] text-destructive/80 hover:text-destructive"
          >
            Clear
          </button>
        </div>
        <p className="text-destructive">{f.disqualified_reason ?? "No identifiable tech angle."}</p>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-background px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Framing brief
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[10.5px] text-um-muted hover:text-foreground"
        >
          Clear
        </button>
      </div>
      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-[11.5px]">
        <FieldRow k="Geographic tier" v={f.geographic_tier ? GEO_LABEL[f.geographic_tier] : "—"} />
        <FieldRow
          k="Category tags"
          v={f.category_tags.length ? f.category_tags.join(", ") : "—"}
        />
        <FieldRow k="Primary frame" v={f.primary_frame ?? "—"} />
        <FieldRow k="Scottish anchor" v={f.scottish_anchor ?? "—"} />
        <dt className="text-um-muted">Per-story brief</dt>
        <dd className="whitespace-pre-wrap text-foreground">{f.per_story_brief || "—"}</dd>
      </dl>
    </div>
  );
}

function FieldRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-um-muted">{k}</dt>
      <dd className="text-foreground">{v}</dd>
    </>
  );
}
