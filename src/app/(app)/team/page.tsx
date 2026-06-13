import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NameCell, RoleCell } from "@/components/forms/team-cells";
import {
  DeleteMemberButton,
  InviteMemberButton,
  SendPasswordResetButton,
} from "@/components/forms/team-crud";

export const dynamic = "force-dynamic";

type Role = "senior_editor" | "editor" | "reviewer" | "viewer";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: Role;
  created_at: string;
  updated_at: string;
};

const ROLE_LABEL: Record<Role, string> = {
  senior_editor: "Senior Editor",
  editor: "Editor",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

const ROLE_TONE: Record<Role, string> = {
  senior_editor: "border-primary/35 bg-primary/10 text-primary",
  editor: "border-state-comm/35 bg-state-comm/10 text-state-comm",
  reviewer: "border-warn/35 bg-warn/10 text-warn",
  viewer: "border-border bg-secondary text-um-muted",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function initials(name: string | null, email: string | null): string {
  const src = (name?.trim() || email?.trim() || "??").slice(0, 64);
  const parts = src.split(/\s+|@/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: meRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  const myRole = (meRow?.role ?? "viewer") as Role;
  const canManage = myRole === "senior_editor";

  // Service-role for emails (auth.users isn't reachable via RLS client).
  const admin = createServiceClient();
  const [{ data: profiles }, listed] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, role, created_at, updated_at")
      .order("created_at", { ascending: true }),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);

  const rows: ProfileRow[] = (profiles ?? []) as ProfileRow[];
  const emailMap = new Map<string, string>();
  for (const u of listed.data?.users ?? []) {
    if (u.email) emailMap.set(u.id, u.email);
  }

  const counts = rows.reduce(
    (acc, p) => {
      acc[p.role] = (acc[p.role] ?? 0) + 1;
      return acc;
    },
    {} as Record<Role, number>,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
        <Users className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold text-foreground">Team</span>
        <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] text-um-muted">
          {rows.length} member{rows.length === 1 ? "" : "s"}
        </span>
        {!canManage ? (
          <span className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] font-medium text-warn">
            Read-only — senior editors can edit
          </span>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mb-5 rounded-md border border-border bg-card p-4">
          <div className="mb-1 flex items-start justify-between gap-4">
            <h2 className="text-[13px] font-semibold text-foreground">Members</h2>
            {canManage ? <InviteMemberButton /> : null}
          </div>
          <p className="text-[12px] leading-[1.5] text-um-muted">
            Roles edit in place — Senior Editors and Editors can be set as
            commissioning assignees. Inviting sends a one-time sign-in link via
            Supabase Auth.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-um-muted">
            <RoleCount label="Senior" n={counts.senior_editor ?? 0} tone="primary" />
            <RoleCount label="Editor" n={counts.editor ?? 0} tone="comm" />
            <RoleCount label="Reviewer" n={counts.reviewer ?? 0} tone="warn" />
            <RoleCount label="Viewer" n={counts.viewer ?? 0} tone="muted" />
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <Th className="w-[42px]">
                  <span className="sr-only">Avatar</span>
                </Th>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Joined</Th>
                <Th>Last update</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-10 text-center text-[12.5px] text-um-muted"
                  >
                    No team members yet.
                  </td>
                </tr>
              ) : null}
              {rows.map((p) => {
                const email = emailMap.get(p.id) ?? null;
                const isMe = p.id === user!.id;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-border last:border-b-0 hover:bg-secondary/40"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border-mid bg-accent font-mono text-[10px] font-bold text-primary">
                        {initials(p.full_name, email)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {canManage ? (
                          <NameCell
                            id={p.id}
                            value={p.full_name ?? email ?? ""}
                          />
                        ) : (
                          <span className="text-[12.5px] text-foreground">
                            {p.full_name ?? email ?? "—"}
                          </span>
                        )}
                        {isMe ? (
                          <span className="rounded-sm border border-border bg-background px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-um-muted">
                            you
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11.5px] text-fg-2">
                      {email ?? <span className="text-um-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {canManage && !isMe ? (
                        <RoleCell id={p.id} value={p.role} />
                      ) : (
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${ROLE_TONE[p.role]}`}
                        >
                          {ROLE_LABEL[p.role]}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] tabular-nums text-um-muted">
                      {fmtDate(p.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] tabular-nums text-um-muted">
                      {fmtDate(p.updated_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canManage ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <SendPasswordResetButton
                            id={p.id}
                            name={p.full_name ?? email ?? "this member"}
                          />
                          <DeleteMemberButton
                            id={p.id}
                            name={p.full_name ?? email ?? "this member"}
                            disabled={isMe}
                          />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`${className ?? ""} px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.05em] text-um-muted`}
    >
      {children}
    </th>
  );
}

function RoleCount({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone: "primary" | "comm" | "warn" | "muted";
}) {
  const cls =
    tone === "primary"
      ? "text-primary"
      : tone === "comm"
        ? "text-state-comm"
        : tone === "warn"
          ? "text-warn"
          : "text-um-muted";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-um-muted">{label}</span>
      <span className={`font-mono font-semibold tabular-nums ${cls}`}>{n}</span>
    </span>
  );
}
