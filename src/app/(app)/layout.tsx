import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { AppTopbarWrapper } from "@/components/shell/app-topbar-wrapper";

function initialsFromName(name: string | null | undefined, fallback: string) {
  const source = name?.trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ROLE_LABEL: Record<string, string> = {
  senior_editor: "Senior Editor",
  editor: "Editor",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

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
  const role = ROLE_LABEL[profile?.role ?? "viewer"] ?? "Viewer";
  const initials = initialsFromName(profile?.full_name, user.email ?? "U");

  return (
    <div className="grid h-screen grid-cols-[216px_1fr] grid-rows-[48px_1fr] overflow-hidden">
      <AppSidebar user={{ fullName, role, initials }} />
      <AppTopbarWrapper userInitials={initials} />
      <main className="overflow-y-auto bg-background">{children}</main>
    </div>
  );
}
