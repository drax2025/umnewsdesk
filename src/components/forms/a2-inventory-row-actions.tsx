"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { SILICON_SCOTLAND_SILOS, type MasterContentInventoryRow } from "@/lib/spec/a2-inventory";
import {
  deleteInventoryRow,
  updateInventoryRow,
  type InventoryActionResult,
} from "@/lib/actions/inventory";

export function InventoryRowActions({
  row,
  canDelete,
}: {
  row: MasterContentInventoryRow;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function onDelete() {
    if (!confirm(`Delete inventory row for "${row.headline}"?`)) return;
    setDeleteError(null);
    const fd = new FormData();
    fd.set("id", row.id);
    startDeleteTransition(async () => {
      const res: InventoryActionResult = await deleteInventoryRow(fd);
      if (!res.ok) setDeleteError(res.error);
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] text-fg-2 hover:bg-secondary"
      >
        <Pencil className="h-3 w-3" />
        Edit
      </button>
      {canDelete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={pendingDelete}
          title={deleteError ?? "Delete row"}
          className="flex h-7 items-center gap-1 rounded-md border border-destructive/35 bg-destructive/10 px-2 text-[11px] text-destructive hover:bg-destructive/15 disabled:opacity-50"
        >
          {pendingDelete ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </button>
      ) : null}
      {open ? (
        <EditDialog row={row} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

function EditDialog({
  row,
  onClose,
}: {
  row: MasterContentInventoryRow;
  onClose: () => void;
}) {
  const [headline, setHeadline] = useState(row.headline);
  const [silo, setSilo] = useState(row.silo ?? "");
  const [publishedAt, setPublishedAt] = useState(row.published_at ?? "");
  const [sectors, setSectors] = useState(row.sectors.join(", "));
  const [notes, setNotes] = useState(row.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!headline.trim()) return setError("Headline is required.");
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("headline", headline);
    fd.set("silo", silo);
    fd.set("sectors", sectors);
    fd.set("published_at", publishedAt);
    fd.set("notes", notes);
    startTransition(async () => {
      const res: InventoryActionResult = await updateInventoryRow(fd);
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
            Edit inventory row
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

          <p className="font-mono text-[10.5px] text-um-muted">
            URL is immutable (used for dedupe). Re-import to change.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                Silo
              </label>
              <input
                type="text"
                value={silo}
                onChange={(e) => setSilo(e.target.value)}
                list="silo-options-edit"
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground focus:border-primary/40 focus:outline-none"
                maxLength={80}
              />
              <datalist id="silo-options-edit">
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
              className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground focus:border-primary/40 focus:outline-none"
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
              className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.45] text-foreground focus:border-primary/40 focus:outline-none"
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
              <Save className="h-3 w-3" />
            )}
            Save changes
          </button>
        </footer>
      </div>
    </div>
  );
}
