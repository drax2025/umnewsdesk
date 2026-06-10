"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  deleteTeamMember,
  inviteTeamMember,
  type TeamActionResult,
} from "@/lib/actions/team";
import { cn } from "@/lib/utils";

type Role = "senior_editor" | "editor" | "reviewer" | "viewer";

const ROLES: { value: Role; label: string }[] = [
  { value: "senior_editor", label: "Senior Editor" },
  { value: "editor", label: "Editor" },
  { value: "reviewer", label: "Reviewer" },
  { value: "viewer", label: "Viewer" },
];

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const labelCls = "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";

/* -------------------------------------------------------------------------- */
/*  INVITE                                                                    */
/* -------------------------------------------------------------------------- */

export function InviteMemberButton() {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-state-comm/35 bg-state-comm/10 px-2.5 text-[11.5px] font-medium text-state-comm hover:bg-state-comm/15"
      >
        <Plus className="h-3.5 w-3.5" />
        Invite member
      </button>
      <TeamDialog ref={ref} title="Invite team member">
        <InviteForm onDone={() => ref.current?.close()} />
      </TeamDialog>
    </>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res: TeamActionResult = await inviteTeamMember(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Invite sent — they'll appear in the table once they accept.");
      setTimeout(onDone, 1200);
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <div>
        <label className={labelCls} htmlFor="invite-name">
          Full name
        </label>
        <input
          id="invite-name"
          name="full_name"
          required
          minLength={2}
          placeholder="e.g. Jamie Patel"
          className={cn(inputCls, "mt-1")}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor="invite-email">
          Email
        </label>
        <input
          id="invite-email"
          name="email"
          required
          type="email"
          placeholder="jamie@unionmedia.co.uk"
          className={cn(inputCls, "mt-1 font-mono text-[11.5px]")}
        />
        <p className="mt-1 text-[10.5px] text-um-muted">
          Supabase will email a one-time sign-in link. The profile row is
          created automatically when they accept.
        </p>
      </div>

      <div>
        <label className={labelCls} htmlFor="invite-role">
          Role
        </label>
        <select
          id="invite-role"
          name="role"
          defaultValue="editor"
          className={cn(inputCls, "mt-1")}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-success/35 bg-success/10 px-2.5 py-1.5 text-[11.5px] text-success">
          {success}
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
          {pending ? "Sending…" : "Send invite"}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  DELETE                                                                    */
/* -------------------------------------------------------------------------- */

export function DeleteMemberButton({
  id,
  name,
  disabled,
}: {
  id: string;
  name: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        disabled={disabled}
        title={disabled ? "You can't remove your own account" : "Remove member"}
        className="flex h-6 w-6 items-center justify-center rounded-sm border border-border bg-background text-fg-2 hover:bg-destructive/15 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-fg-2"
      >
        <Trash2 className="h-3 w-3" />
      </button>
      <TeamDialog ref={ref} title={`Remove ${name}?`}>
        <DeleteConfirm id={id} name={name} onDone={() => ref.current?.close()} />
      </TeamDialog>
    </>
  );
}

function DeleteConfirm({
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
      const res = await deleteTeamMember(fd);
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
        deletes their Supabase auth user and cascades to the profile row.
        Articles and commissions they own will keep the link but no longer
        resolve to a person.
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
          {pending ? "Removing…" : "Remove member"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DIALOG SHELL                                                              */
/* -------------------------------------------------------------------------- */

function TeamDialog({
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
      className="fixed inset-0 m-auto h-fit w-[460px] max-w-[92vw] rounded-lg border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/40 backdrop:backdrop-blur-sm"
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
