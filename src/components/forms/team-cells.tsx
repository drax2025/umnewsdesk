"use client";

import { useState, useTransition } from "react";
import { updateProfileName, updateProfileRole } from "@/lib/actions/team";
import { cn } from "@/lib/utils";

type Role = "senior_editor" | "editor" | "reviewer" | "viewer";

const ROLES: { value: Role; label: string }[] = [
  { value: "senior_editor", label: "Senior Editor" },
  { value: "editor", label: "Editor" },
  { value: "reviewer", label: "Reviewer" },
  { value: "viewer", label: "Viewer" },
];

const ROLE_TONE: Record<Role, string> = {
  senior_editor: "text-primary",
  editor: "text-state-comm",
  reviewer: "text-warn",
  viewer: "text-um-muted",
};

export function RoleCell({
  id,
  value,
  disabled,
}: {
  id: string;
  value: Role;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  // Controlled select. A previous version used an uncontrolled
  // <select defaultValue> inside a <form action>; React 19 resets a form's
  // uncontrolled fields once the action settles, so the role snapped straight
  // back to its default — looking like the change never saved. Driving the
  // value from state (and calling the action imperatively) keeps the pick.
  const [current, setCurrent] = useState<Role>(value);
  const [error, setError] = useState<string | null>(null);

  function change(next: Role) {
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("role", next);
      const res = await updateProfileRole(fd);
      if (!res.ok) {
        setError(res.error);
        setCurrent(prev); // revert only on a genuine failure
      }
    });
  }

  return (
    <div className="inline-flex flex-col gap-0.5">
      <select
        value={current}
        disabled={pending || disabled}
        onChange={(e) => change(e.currentTarget.value as Role)}
        className={cn(
          "h-6 cursor-pointer rounded-sm border border-border bg-background px-1.5 text-[11px] focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
          ROLE_TONE[current],
        )}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {error ? (
        <span className="text-[10px] leading-tight text-destructive">{error}</span>
      ) : null}
    </div>
  );
}

export function NameCell({
  id,
  value,
  disabled,
}: {
  id: string;
  value: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(value);
  return (
    <form
      action={(fd) => startTransition(() => updateProfileName(fd).then(() => undefined))}
      className="inline-block w-full"
    >
      <input type="hidden" name="id" value={id} />
      <input
        type="text"
        name="full_name"
        value={current}
        disabled={pending || disabled}
        onChange={(e) => setCurrent(e.currentTarget.value)}
        onBlur={(e) => {
          const next = e.currentTarget.value.trim();
          if (next && next !== value) {
            e.currentTarget.form?.requestSubmit();
          } else {
            setCurrent(value);
          }
        }}
        className="h-6 w-full rounded-sm border border-transparent bg-transparent px-1.5 text-[12.5px] text-foreground hover:border-border focus:border-primary focus:bg-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </form>
  );
}
