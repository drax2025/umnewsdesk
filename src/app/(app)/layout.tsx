import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { AppTopbarWrapper } from "@/components/shell/app-topbar-wrapper";
import { getNavForRole } from "@/lib/shell/get-nav-for-role";
import { getHighlightColour } from "@/lib/branding";
import { ROLE_LABEL, type Role } from "@/lib/spec/menu-permissions";
import type { CSSProperties } from "react";

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

  // Profile fetch is best-effort — if the row is missing we still render
  // the shell with sensible fallbacks rather than 500 the whole app.
  let profileFullName: string | null = null;
  let profileRoleRaw: string | null = null;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single<{ full_name: string | null; role: string | null }>();
    profileFullName = profile?.full_name ?? null;
    profileRoleRaw = profile?.role ?? null;
  } catch (err) {
    console.warn("[(app) layout] profile lookup failed:", err);
  }

  const fullName = profileFullName ?? user.email ?? "User";
  const role: Role = asRole(profileRoleRaw);
  const roleLabel = ROLE_LABEL[role];
  const initials = initialsFromName(profileFullName, user.email ?? "U");

  // Resolve the visible nav for this role. Items the role can't access are
  // dropped; read-only items stay in the list with an accessLevel flag the
  // sidebar uses to render a small lock badge. getNavForRole has its own
  // fallback wrapper so this await cannot throw.
  const navSections = await getNavForRole(role);

  // Global highlight colour (Settings page) → exposed as a CSS var so any
  // surface can background its selected options with it (e.g. F1 triage).
  const highlightColour = await getHighlightColour();
  const shellStyle = highlightColour
    ? ({ "--um-highlight": highlightColour } as CSSProperties)
    : undefined;

  return (
    <div
      style={shellStyle}
      className="grid h-screen grid-cols-[216px_1fr] grid-rows-[48px_1fr] overflow-hidden"
    >
      <AppSidebar
        user={{ fullName, role: roleLabel, initials }}
        sections={navSections}
      />
      <AppTopbarWrapper userInitials={initials} />
      <main className="overflow-y-auto bg-background">{children}</main>
    </div>
  );
}
