import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { RolePermissionsEditor } from "@/components/forms/role-permissions-editor";
import {
  ALL_ROLES,
  DEFAULT_PERMISSIONS,
  MENU_KEYS,
  type AccessLevel,
  type Role,
} from "@/lib/spec/menu-permissions";

export const dynamic = "force-dynamic";

/**
 * /system/permissions — grid editor for per-role left-nav access.
 *
 * Admin-only (gated both here at page render and inside the
 * server actions). Admin's own column is locked to 'Full' in the
 * UI because the code-side resolver overrides it to 'full' anyway — see
 * resolveAccess() in src/lib/spec/menu-permissions.ts for the lockout
 * safety rationale.
 *
 * Build the `initial` map server-side from current DB rows, falling back
 * to DEFAULT_PERMISSIONS for any (role, menu_key) pair that hasn't been
 * persisted yet. Passed to the client editor as a plain JSON-safe object.
 */
export default async function PermissionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: meRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string | null }>();
  if (meRow?.role !== "admin") {
    redirect("/");
  }

  const admin = createServiceClient();
  const { data: rows } = await admin
    .from("role_menu_permissions")
    .select("role, menu_key, access")
    .returns<Array<{ role: Role; menu_key: string; access: AccessLevel }>>();

  // Pre-seed with defaults, then overlay any persisted rows on top. This
  // way the grid never has empty cells even if the DB hasn't seen a row
  // for a particular pair yet (e.g. after adding a new menu item).
  const initial: Record<Role, Record<string, AccessLevel>> = {
    admin: { ...DEFAULT_PERMISSIONS.admin },
    editor: { ...DEFAULT_PERMISSIONS.editor },
    reviewer: { ...DEFAULT_PERMISSIONS.reviewer },
    viewer: { ...DEFAULT_PERMISSIONS.viewer },
  };
  for (const r of rows ?? []) {
    if (initial[r.role] && typeof r.menu_key === "string") {
      initial[r.role][r.menu_key] = r.access;
    }
  }

  // Surface counts for the header — a quick "how customised is this?"
  // signal so the publisher knows whether they've drifted from defaults.
  const customisedCount = (rows ?? []).filter(
    (r) =>
      DEFAULT_PERMISSIONS[r.role] &&
      DEFAULT_PERMISSIONS[r.role][r.menu_key] !== r.access,
  ).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-baseline gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            <h1 className="text-[14px] font-semibold tracking-tight">
              Permissions · per-role left-nav access
            </h1>
          </div>
          <span className="font-mono text-[11px] text-um-muted">
            {ALL_ROLES.length} roles · {MENU_KEYS.length} menu items ·{" "}
            {customisedCount} customised from defaults
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[1320px] space-y-3 px-6 py-4">
        <p className="rounded-md border border-dashed border-border bg-background/40 px-3 py-2 text-[10.5px] leading-[1.5] text-um-muted">
          <strong className="text-fg-2">Policy:</strong> each cell controls
          whether the role sees that menu item, sees it as read-only, or has
          full access. <strong className="text-fg-2">Admin</strong>{" "}
          is always resolved to full access in code regardless of what&apos;s
          saved here — a lockout safety net so you can never block yourself
          out of this very page. Changes save instantly; the affected
          role&apos;s sidebar refreshes on their next navigation.
        </p>

        <RolePermissionsEditor initial={initial} />

        <p className="rounded-md border border-border bg-card px-3 py-2 text-[10.5px] leading-[1.55] text-um-muted">
          <strong className="text-fg-2">Read-only enforcement:</strong> the
          sidebar respects this immediately — items flagged{" "}
          <em>read-only</em> appear with a lock badge. Per-page write
          gating (e.g. blocking a reviewer from saving a draft) is enforced
          by the existing role checks inside each server action; this grid
          drives the visibility layer. Hidden items are not just hidden — a
          role with{" "}
          <em>hidden</em> access for a page can still load the URL directly
          if a deep-link is forwarded to them. To block that, add an
          explicit role redirect at the top of the page (same pattern{" "}
          <code className="font-mono text-[10px]">/system/titles</code>{" "}
          uses).
        </p>
      </div>
    </div>
  );
}
