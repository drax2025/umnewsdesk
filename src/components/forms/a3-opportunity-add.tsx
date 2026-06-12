"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import {
  OPPORTUNITY_SECTIONS,
  type OpportunitySection,
} from "@/lib/spec/a3-opportunities";
import {
  addOpportunity,
  type OpportunityActionResult,
} from "@/lib/actions/opportunities";

type TitleRow = { id: string; slug: string; name: string };

export function OpportunityAddButton({ titles }: { titles: TitleRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 text-[11.5px] font-semibold text-primary hover:bg-primary/15"
      >
        <Plus className="h-3 w-3" />
        Add opportunity
      </button>
      {open ? (
        <AddDialog titles={titles} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function AddDialog({
  titles,
  onClose,
}: {
  titles: TitleRow[];
  onClose: () => void;
}) {
  const [titleId, setTitleId] = useState(titles[0]?.id ?? "");
  const [headline, setHeadline] = useState("");
  const [section, setSection] = useState<OpportunitySection>("b_followup");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<"1" | "2" | "3" | "">("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!titleId) return setError("Pick a title.");
    if (!headline.trim()) return setError("Title required.");
    const fd = new FormData();
    fd.set("title_id", titleId);
    fd.set("title", headline);
    fd.set("section", section);
    fd.set("category", category);
    if (priority) fd.set("priority", priority);
    fd.set("notes", notes);
    startTransition(async () => {
      const res: OpportunityActionResult = await addOpportunity(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <header className="flex items-center justify-between border-b border-border bg-background/30 px-4 py-2">
          <h2 className="text-[12.5px] font-semibold text-foreground">
            Add editorial opportunity
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-um-muted hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                Title *
              </label>
              <select
                value={titleId}
                onChange={(e) => setTitleId(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
              >
                {titles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                Section *
              </label>
              <select
                value={section}
                onChange={(e) =>
                  setSection(e.target.value as OpportunitySection)
                }
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
              >
                {OPPORTUNITY_SECTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.code} · {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              Headline / pitch *
            </label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground focus:border-primary/40 focus:outline-none"
              maxLength={240}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                Category / beat
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. quantum, space, governance"
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
                maxLength={120}
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as "1" | "2" | "3" | "")
                }
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
              >
                <option value="">—</option>
                <option value="1">1 · high</option>
                <option value="2">2 · medium</option>
                <option value="3">3 · low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Context, source pointers, why it's worth pursuing"
              className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.45] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
              maxLength={1200}
            />
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[11.5px] text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border bg-background/30 px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-8 rounded-md border border-border bg-background px-3 text-[11.5px] text-fg-2 hover:bg-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 text-[11.5px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Add
          </button>
        </footer>
      </div>
    </div>
  );
}
