"use client";

import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import {
  createCrmAgency,
  createCrmProspect,
  ignoreCrmDomain,
  ignoreCrmDomains,
  resolveCrmMatch,
  type CrmQueueResult,
} from "@/lib/actions/crm-queue";

export type QueueRow = {
  id: number;
  domain: string;
  sender_name: string | null;
  /** What the name box starts as — see suggestedOrgName. */
  suggested_name?: string;
  reason: string;
  candidates: { id: string; name: string; lifecycle: string }[] | null;
  created_at: string;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });

/**
 * The queue, with selection.
 *
 * Selection is the point rather than a nicety: ninety of the first ninety-three
 * entries were in-house press offices and three were agencies the rules missed,
 * so the work is "rule out most of this list, keep a few" — which needs
 * per-row checkboxes, not a select-all on its own.
 */
export function CrmQueueTable({
  rows,
  canManage,
  crmUrl,
}: {
  rows: QueueRow[];
  canManage: boolean;
  crmUrl: string;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  // The name each record will be created under. Pre-filled with the same
  // suggestion the CRM would reach on its own, so what is on screen is what
  // gets saved — sugarbirdwines.com was created as "Becky Orlinski" precisely
  // because nobody could see the name before it was written.
  const [names, setNames] = useState<Record<number, string>>(
    () => Object.fromEntries(rows.map((r) => [r.id, r.suggested_name ?? r.domain])),
  );
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const run = (id: number, fn: (id: number, name?: string) => Promise<CrmQueueResult>) => () =>
    startTransition(async () => {
      const r = await fn(id, names[id]?.trim() || undefined);
      setErrors((prev) => {
        const next = { ...prev };
        if (r.ok) delete next[id]; else next[id] = r.error;
        return next;
      });
    });

  const allPicked = rows.length > 0 && picked.size === rows.length;

  return (
    <>
      {canManage ? (
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[11.5px]">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-um-muted">
            <input
              type="checkbox"
              checked={allPicked}
              onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
              className="h-3.5 w-3.5 accent-current"
            />
            Select all {rows.length}
          </label>
          {picked.size > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await ignoreCrmDomains([...picked]);
                  setNote(r.ok ? (r.message ?? "done") : r.error);
                  if (r.ok) setPicked(new Set());
                })
              }
              className="inline-flex h-6 items-center rounded-md border border-border bg-secondary px-2 font-medium text-fg-2 hover:bg-secondary/70 disabled:opacity-50"
            >
              {pending ? "Working…" : `Not an agency — ${picked.size}`}
            </button>
          ) : null}
          {note ? <span className="text-um-muted">{note}</span> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              {canManage ? <Th className="w-[34px]" /> : null}
              <Th className="w-[220px]">Sender</Th>
              <Th>Why it is here</Th>
              <Th className="w-[90px]">Seen</Th>
              <Th className="w-[300px] text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-secondary/40">
                {canManage ? (
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={picked.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="h-3.5 w-3.5 accent-current"
                      aria-label={`Select ${r.domain}`}
                    />
                  </td>
                ) : null}
                <td className="px-3 py-2 align-top">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11.5px] text-foreground">{r.domain}</span>
                    {/* Deciding whether a sender is an agency, a business or a
                        press office usually means looking at the site. noreferrer
                        as well as noopener: these are unvetted third parties. */}
                    <a
                      href={`https://${r.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${r.domain} in a new tab`}
                      aria-label={`Open ${r.domain} in a new tab`}
                      className="text-um-muted transition-colors hover:text-primary"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {r.sender_name ? <div className="text-[11px] text-um-muted">{r.sender_name}</div> : null}
                  {canManage ? (
                    <input
                      type="text"
                      value={names[r.id] ?? ""}
                      onChange={(e) => setNames((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder={r.domain}
                      aria-label={`Name to create ${r.domain} under`}
                      title="The name this record will be created under"
                      className="mt-1 h-6 w-full rounded-md border border-border bg-secondary/40 px-1.5 text-[11.5px] text-foreground placeholder:text-um-muted focus:border-primary/50 focus:outline-none"
                    />
                  ) : null}
                </td>
                <td className="px-3 py-2 align-top text-[12px] text-fg-2">
                  {r.reason}
                  {r.candidates?.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.candidates.map((c) => (
                        <a
                          key={c.id}
                          href={`${crmUrl}/organisations/${c.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] text-fg-2 hover:text-foreground"
                        >
                          {c.name} · {c.lifecycle}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {errors[r.id] ? (
                    <div className="mt-1 text-[10.5px] text-danger">{errors[r.id]}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 align-top font-mono text-[11px] text-um-muted">{fmt(r.created_at)}</td>
                <td className="px-3 py-2 align-top">
                  {canManage ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button" disabled={pending} onClick={run(r.id, createCrmAgency)}
                        title="An agency the rules missed — adds a client tagged 'PR Agency'"
                        className="inline-flex h-6 items-center rounded-md border border-success/35 bg-success/10 px-2 text-[11px] font-medium text-success hover:bg-success/15 disabled:opacity-50"
                      >
                        PR agency
                      </button>
                      <button
                        type="button" disabled={pending} onClick={run(r.id, createCrmProspect)}
                        title="Sends its own PR — adds a prospect worth a call about marketing or paid PR"
                        className="inline-flex h-6 items-center rounded-md border border-primary/35 bg-primary/10 px-2 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
                      >
                        Prospect
                      </button>
                      <button
                        type="button" disabled={pending} onClick={run(r.id, (i) => ignoreCrmDomain(i))}
                        title="Never an agency — this domain will not be raised again"
                        className="inline-flex h-6 items-center rounded-md border border-border bg-secondary px-2 text-[11px] font-medium text-fg-2 hover:bg-secondary/70 disabled:opacity-50"
                      >
                        Not an agency
                      </button>
                      <button
                        type="button" disabled={pending} onClick={run(r.id, resolveCrmMatch)}
                        title="Already handled in the CRM — just clear this row"
                        className="inline-flex h-6 items-center rounded-md px-1.5 text-[11px] text-um-muted hover:text-foreground disabled:opacity-50"
                      >
                        Done
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`${className ?? ""} px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.05em] text-um-muted`}
    >
      {children}
    </th>
  );
}
