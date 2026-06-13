import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { AppTopbarWrapper } from "@/components/shell/app-topbar-wrapper";
import { getNavForRole } from "@/lib/shell/get-nav-for-role";
import { ROLE_LABEL, type Role } from "@/lib/spec/menu-permissions";

function initialsFromName(name: string | null | undefined, fallback: string) {
  const source = name?.trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ROLE_SET = new Set<Role>([
  "senior_editor",
  "editor",
  "reviewer",
  "viewer",
]);

function asRole(raw: string | null | undefined): Role {
  return raw && ROLE_SET.has(raw as Role) ? (raw as Role) : "viewer";
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const fullName = profile?.full_name ?? user.email ?? "User";
  const role: Role = asRole(profile?.role ?? null);
  const roleLabel = ROLE_LABEL[role];
  const initials = initialsFromName(profile?.full_name, user.email ?? "U");

  // Resolve the visible nav for this role. Items the role can't access are
  // dropped; read-only items stay in the list with an accessLevel flag the
  // sidebar uses to render a small lock badge.
  const navSections = await getNavForRole(role);

  return (
    <div className="grid h-screen grid-cols-[216px_1fr] grid-rows-[48px_1fr] overflow-hidden">
      <AppSidebar
        user={{ fullName, role: roleLabel, initials }}
        sections={navSections}
      />
      <AppTopbarWrapper userInitials={initials} />
      <main className="overflow-y-auto bg-background">{children}</main>
    </div>
  );
}
