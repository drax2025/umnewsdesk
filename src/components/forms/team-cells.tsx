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
  return (
    <form
      action={(fd) => startTransition(() => updateProfileRole(fd).then(() => undefined))}
      className="inline-block"
    >
      <input type="hidden" name="id" value={id} />
      <select
        name="role"
        defaultValue={value}
        disabled={pending || disabled}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn(
          "h-6 cursor-pointer rounded-sm border border-border bg-background px-1.5 text-[11px] focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
          ROLE_TONE[value],
        )}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </form>
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
