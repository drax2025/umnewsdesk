"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  type AgencyActionResult,
  createAgency,
  deleteAgency,
  updateAgencyDomains,
  updateAgencyName,
  updateAgencySource,
  updateAgencyTier,
} from "@/lib/actions/agencies";
import { cn } from "@/lib/utils";

type Tier = 1 | 2 | 3;

const TIERS: { value: Tier; label: string }[] = [
  { value: 1, label: "1 — Known good" },
  { value: 2, label: "2 — Default" },
  { value: 3, label: "3 — Watch" },
];

const TIER_TONE: Record<Tier, string> = {
  1: "text-success",
  2: "text-fg-2",
  3: "text-warn",
};

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const labelCls = "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";

/* -------------------------------------------------------------------------- */
/*  ADD                                                                       */
/* -------------------------------------------------------------------------- */

export function AddAgencyButton({
  sources,
}: {
  sources: { id: string; name: string; code: string }[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-state-comm/35 bg-state-comm/10 px-2.5 text-[11.5px] font-medium text-state-comm hover:bg-state-comm/15"
      >
        <Plus className="h-3.5 w-3.5" />
        Add agency
      </button>
      <AgencyDialog ref={ref} title="Add press agency">
        <AddAgencyForm sources={sources} onDone={() => ref.current?.close()} />
      </AgencyDialog>
    </>
  );
}

function AddAgencyForm({
  sources,
  onDone,
}: {
  sources: { id: string; name: string; code: string }[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res: AgencyActionResult = await createAgency(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <div>
        <label className={labelCls} htmlFor="agency-name">
          Display name
        </label>
        <input
          id="agency-name"
          name="name"
          required
          minLength={2}
          placeholder="e.g. Edelman UK"
          className={cn(inputCls, "mt-1")}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor="agency-domains">
          Email domains
        </label>
        <input
          id="agency-domains"
          name="email_domains"
          required
          placeholder="edelman.com, edelman.co.uk"
          className={cn(inputCls, "mt-1 font-mono text-[11.5px]")}
        />
        <p className="mt-1 text-[10.5px] text-um-muted">
          Comma- or space-separated. Used to match inbound press releases by
          sender domain.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="agency-tier">
            Trust tier
          </label>
          <select
            id="agency-tier"
            name="trust_tier"
            defaultValue="2"
            className={cn(inputCls, "mt-1")}
          >
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="agency-source">
            Discovery source (optional)
          </label>
          <select
            id="agency-source"
            name="source_id"
            defaultValue=""
            className={cn(inputCls, "mt-1")}
          >
            <option value="">— Fallback: PRESS_MAILBOX</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="h-7 rounded-md border border-border bg-background px-3 text-[11.5px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-7 rounded-md border border-state-comm/35 bg-state-comm/10 px-3 text-[11.5px] font-semibold text-state-comm hover:bg-state-comm/15 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add agency"}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  INLINE CELLS                                                              */
/* -------------------------------------------------------------------------- */

export function AgencyNameCell({ id, value }: { id: string; value: string }) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(value);
  return (
    <form
      action={(fd) => startTransition(() => updateAgencyName(fd).then(() => undefined))}
      className="inline-block w-full"
    >
      <input type="hidden" name="id" value={id} />
      <input
        type="text"
        name="name"
        value={current}
        disabled={pending}
        onChange={(e) => setCurrent(e.currentTarget.value)}
        onBlur={(e) => {
          const next = e.currentTarget.value.trim();
          if (next && next !== value) e.currentTarget.form?.requestSubmit();
          else setCurrent(value);
        }}
        className="h-6 w-full rounded-sm border border-transparent bg-transparent px-1.5 text-[12.5px] text-foreground hover:border-border focus:border-primary focus:bg-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </form>
  );
}

export function AgencyDomainsCell({
  id,
  value,
}: {
  id: string;
  value: string[];
}) {
  const joined = value.join(", ");
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(joined);
  return (
    <form
      action={(fd) => startTransition(() => updateAgencyDomains(fd).then(() => undefined))}
      className="inline-block w-full"
    >
      <input type="hidden" name="id" value={id} />
      <input
        type="text"
        name="email_domains"
        value={current}
        disabled={pending}
        onChange={(e) => setCurrent(e.currentTarget.value)}
        onBlur={(e) => {
          const next = e.currentTarget.value.trim();
          if (next && next !== joined) e.currentTarget.form?.requestSubmit();
          else setCurrent(joined);
        }}
        className="h-6 w-full rounded-sm border border-transparent bg-transparent px-1.5 font-mono text-[11.5px] text-foreground hover:border-border focus:border-primary focus:bg-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </form>
  );
}

export function AgencyTierCell({ id, value }: { id: string; value: Tier }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => startTransition(() => updateAgencyTier(fd).then(() => undefined))}
      className="inline-block"
    >
      <input type="hidden" name="id" value={id} />
      <select
        name="trust_tier"
        defaultValue={value}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn(
          "h-6 cursor-pointer rounded-sm border border-border bg-background px-1.5 text-[11px] focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
          TIER_TONE[value],
        )}
      >
        {TIERS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </form>
  );
}

export function AgencySourceCell({
  id,
  value,
  sources,
}: {
  id: string;
  value: string | null;
  sources: { id: string; name: string; code: string }[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => startTransition(() => updateAgencySource(fd).then(() => undefined))}
      className="inline-block w-full"
    >
      <input type="hidden" name="id" value={id} />
      <select
        name="source_id"
        defaultValue={value ?? ""}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-6 w-full cursor-pointer rounded-sm border border-border bg-background px-1.5 text-[11px] text-fg-2 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">— PRESS_MAILBOX (fallback)</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.code})
          </option>
        ))}
      </select>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  DELETE                                                                    */
/* -------------------------------------------------------------------------- */

export function DeleteAgencyButton({ id, name }: { id: string; name: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        title="Remove agency"
        className="flex h-6 w-6 items-center justify-center rounded-sm border border-border bg-background text-fg-2 hover:bg-destructive/15 hover:text-destructive"
      >
        <Trash2 className="h-3 w-3" />
      </button>
      <AgencyDialog ref={ref} title={`Remove ${name}?`}>
        <DeleteAgencyConfirm id={id} name={name} onDone={() => ref.current?.close()} />
      </AgencyDialog>
    </>
  );
}

function DeleteAgencyConfirm({
  id,
  name,
  onDone,
}: {
  id: string;
  name: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function confirm() {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await deleteAgency(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-[1.5] text-fg-2">
        Removing <span className="font-semibold text-foreground">{name}</span>{" "}
        means new emails from its domains will land on{" "}
        <code className="rounded-sm bg-secondary px-1 font-mono text-[11px]">PRESS_MAILBOX</code>{" "}
        as unverified. Existing candidates keep their attribution.
      </p>
      {error ? (
        <div className="rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
          {error}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="h-7 rounded-md border border-border bg-background px-3 text-[11.5px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="h-7 rounded-md border border-destructive/40 bg-destructive/10 px-3 text-[11.5px] font-semibold text-destructive hover:bg-destructive/15 disabled:opacity-60"
        >
          {pending ? "Removing…" : "Remove agency"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DIALOG SHELL                                                              */
/* -------------------------------------------------------------------------- */

function AgencyDialog({
  ref,
  title,
  children,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <dialog
      ref={ref}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="fixed inset-0 m-auto h-fit w-[520px] max-w-[92vw] rounded-lg border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/40 backdrop:backdrop-blur-sm"
    >
      <div
        className="flex items-center justify-between border-b border-border px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-um-muted hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </dialog>
  );
}
