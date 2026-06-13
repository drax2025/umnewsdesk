import { createServiceClient } from "@/lib/supabase/service";
import { NAV_SECTIONS, type NavItem, type NavSection } from "@/components/shell/nav-config";
import {
  resolveAccess,
  type AccessLevel,
  type Role,
} from "@/lib/spec/menu-permissions";

/**
 * Filter NAV_SECTIONS down to what a given role can see, and annotate each
 * surviving item with its effective access level. Called from
 * src/app/(app)/layout.tsx on every render of the app shell.
 *
 * Behaviour:
 *   - 'hidden' items are dropped
 *   - 'read_only' items stay in the nav and carry accessLevel='read_only'
 *     so the sidebar can render a small lock badge next to them
 *   - 'full' items render normally
 *
 * Sections that end up with zero visible items are dropped so we don't
 * render an empty "System" header for a viewer who's locked out of all of it.
 *
 * Falls back to DEFAULT_PERMISSIONS (in resolveAccess) when the
 * role_menu_permissions table is unreachable — keeps the app usable even
 * if the table is missing in a dev environment that hasn't run 0034 yet.
 */

export type SidebarNavItem = NavItem & { accessLevel: AccessLevel };
// Defining items as its own field (rather than `NavSection & { items: ... }`
// intersection) keeps TS from widening back to the base NavItem when the
// sidebar iterates section.items.
export type SidebarNavSection = {
  label: NavSection["label"];
  items: SidebarNavItem[];
};

export async function getNavForRole(
  role: Role | null,
): Promise<SidebarNavSection[]> {
  // No role / unauth case: render the nav as if the user were a viewer.
  // The route guards in /(app)/layout.tsx redirect to /login before we
  // get here, so this is really just a safety fallback.
  const effective: Role = role ?? "viewer";

  // Senior Editor always sees everything — skip the DB hop entirely.
  if (effective === "senior_editor") {
    return NAV_SECTIONS.map((s) => ({
      ...s,
      items: s.items.map((i) => ({ ...i, accessLevel: "full" as const })),
    }));
  }

  // Pull just the rows for the caller's role. Small table (~100 rows total),
  // so even a full table scan is cheap; this still keeps the network payload
  // minimal.
  let permissionMap: Map<string, AccessLevel> | null = null;
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("role_menu_permissions")
      .select("menu_key, access")
      .eq("role", effective)
      .returns<Array<{ menu_key: string; access: AccessLevel }>>();
    if (data) {
      permissionMap = new Map(data.map((r) => [r.menu_key, r.access]));
    }
  } catch {
    // Table missing / network blip — fall through to DEFAULT_PERMISSIONS.
    permissionMap = null;
  }

  const out: SidebarNavSection[] = [];
  for (const section of NAV_SECTIONS) {
    const survivingItems: SidebarNavItem[] = [];
    for (const item of section.items) {
      const accessLevel = resolveAccess(effective, item.key, permissionMap);
      if (accessLevel === "hidden") continue;
      survivingItems.push({ ...item, accessLevel });
    }
    if (survivingItems.length > 0) {
      out.push({ ...section, items: survivingItems });
    }
  }
  return out;
}
