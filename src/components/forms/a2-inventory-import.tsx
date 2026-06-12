"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import {
  INVENTORY_SOURCES,
  SILICON_SCOTLAND_SILOS,
  type InventorySource,
} from "@/lib/spec/a2-inventory";
import {
  importInventoryRow,
  type InventoryActionResult,
} from "@/lib/actions/inventory";

type TitleRow = { id: string; slug: string; name: string };

export function InventoryImportButton({ titles }: { titles: TitleRow[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 text-[11.5px] font-semibold text-primary hover:bg-primary/15"
      >
        <Plus className="h-3 w-3" />
        Import row
      </button>
      {open ? (
        <ImportDialog titles={titles} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function ImportDialog({
  titles,
  onClose,
}: {
  titles: TitleRow[];
  onClose: () => void;
}) {
  const [titleId, setTitleId] = useState(titles[0]?.id ?? "");
  const [headline, setHeadline] = useState("");
  const [url, setUrl] = useState("");
  const [silo, setSilo] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [sectors, setSectors] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<InventorySource>("legacy_import");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!titleId) return setError("Pick a title.");
    if (!headline.trim()) return setError("Headline is required.");
    if (!url.trim()) return setError("URL is required.");

    const fd = new FormData();
    fd.set("title_id", titleId);
    fd.set("headline", headline);
    fd.set("url", url);
    fd.set("silo", silo);
    fd.set("sectors", sectors);
    fd.set("published_at", publishedAt);
    fd.set("source", source);
    fd.set("notes", notes);

    startTransition(async () => {
      const res: InventoryActionResult = await importInventoryRow(fd);
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
            Import inventory row
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
                Source *
              </label>
              <select
                value={source}
                onChange={(e) =>
                  setSource(e.target.value as InventorySource)
                }
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
              >
                {INVENTORY_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              Headline *
            </label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground focus:border-primary/40 focus:outline-none"
              maxLength={400}
            />
          </div>

          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              Live URL *
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://siliconscotland.com/…"
              className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 font-mono text-[11.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                Silo
              </label>
              <input
                type="text"
                value={silo}
                onChange={(e) => setSilo(e.target.value)}
                list="silo-options"
                placeholder="e.g. Cyber"
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
                maxLength={80}
              />
              <datalist id="silo-options">
                {SILICON_SCOTLAND_SILOS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                Published date
              </label>
              <input
                type="date"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 font-mono text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              Sectors (comma-separated)
            </label>
            <input
              type="text"
              value={sectors}
              onChange={(e) => setSectors(e.target.value)}
              placeholder="quantum, defence, deep-tech"
              className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
              maxLength={400}
            />
          </div>

          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
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
            Save row
          </button>
        </footer>
      </div>
    </div>
  );
}
