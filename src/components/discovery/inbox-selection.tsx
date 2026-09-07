"use client";

import {
  createContext, useCallback, useContext, useMemo, useState,
} from "react";
import { RejectDialog } from "@/components/discovery/reject-dialog";

/**
 * Row selection for bulk actions.
 *
 * The provider wraps the server-rendered table — the rows stay on the server,
 * only the checkboxes and the bar are client components.
 *
 * Selection can never outlive the list it was made from: picking forty stories
 * in one filter, switching to another and hitting reject must not reject the
 * wrong forty. The caller passes the filter/sort querystring as React `key`, so
 * any change to what is on screen remounts this and the selection is gone by
 * construction — rather than being cleared afterwards by an effect, which is a
 * frame too late and one forgotten dependency away from being wrong.
 */

type Row = { id: string; headline: string };

type Ctx = {
  selected: Set<string>;
  toggle: (id: string) => void;
  isSelected: (id: string) => boolean;
};

const SelectionCtx = createContext<Ctx | null>(null);

export function InboxSelectionProvider({
  rows,
  children,
}: {
  rows: Row[];
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);
  const value = useMemo(() => ({ selected, toggle, isSelected }), [selected, toggle, isSelected]);

  // Only rows still on screen can be acted on, in the order they appear.
  const targets = rows.filter((r) => selected.has(r.id));

  return (
    <SelectionCtx.Provider value={value}>
      {children}
      <BulkBar
        targets={targets}
        total={rows.length}
        onClear={() => setSelected(new Set())}
        onSelectAll={() => setSelected(new Set(rows.map((r) => r.id)))}
      />
    </SelectionCtx.Provider>
  );
}

export function RowCheckbox({ id }: { id: string }) {
  const ctx = useContext(SelectionCtx);
  if (!ctx) return null;
  return (
    <input
      type="checkbox"
      checked={ctx.isSelected(id)}
      onChange={() => ctx.toggle(id)}
      aria-label="Select for bulk actions"
      className="h-3.5 w-3.5 cursor-pointer accent-primary"
    />
  );
}

function BulkBar({
  targets, total, onClear, onSelectAll,
}: {
  targets: Row[];
  total: number;
  onClear: () => void;
  onSelectAll: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  if (targets.length === 0) return null;
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-xl">
          <span className="text-[11.5px] text-fg-2">
            <strong className="font-mono tabular-nums text-foreground">{targets.length}</strong>{" "}
            selected
          </span>
          {targets.length < total ? (
            <button type="button" onClick={onSelectAll} className="text-[11.5px] text-primary hover:underline">
              Select all {total}
            </button>
          ) : null}
          <button type="button" onClick={onClear} className="text-[11.5px] text-um-muted hover:text-foreground">
            Clear
          </button>
          <span className="h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="h-6 rounded-full border border-destructive/45 bg-destructive/15 px-3 text-[11.5px] font-medium text-destructive transition-colors hover:bg-destructive/25"
          >
            Reject {targets.length}
          </button>
        </div>
      </div>
      {rejecting ? (
        <RejectDialog targets={targets} onClose={() => setRejecting(false)} onDone={onClear} />
      ) : null}
    </>
  );
}
