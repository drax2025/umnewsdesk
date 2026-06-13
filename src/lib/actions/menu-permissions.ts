"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ALL_ACCESS_LEVELS,
  ALL_ROLES,
  DEFAULT_PERMISSIONS,
  MENU_KEYS,
  MENU_KEY_SET,
  type AccessLevel,
  type Role,
} from "@/lib/spec/menu-permissions";

/**
 * Server actions for /system/permissions.
 *
 * Two verbs:
 *   setMenuPermission(fd)         — update one (role, menu_key) cell
 *   resetMenuPermissionsToDefaults — wipe and re-seed everything
 *
 * Both require senior_editor on top of the DB-side service_role gate so a
 * lesser role can't escalate by forging the form post. Senior Editor's own
 * rows can be edited too, but the code-side resolver in resolveAccess()
 * always overrides them to 'full' — so there's no way to get permanently
 * locked out from the very screen you'd need to fix it from.
 */

export type MenuPermissionsActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function requireSeniorEditor(): Promise<MenuPermissionsActionResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string | null }>();
  if (me?.role !== "senior_editor") {
    return { ok: false, error: "Senior Editor only" };
  }
  return null;
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function parseRole(raw: unknown): Role | null {
  const s = String(raw ?? "").trim();
  return (ALL_ROLES as readonly string[]).includes(s) ? (s as Role) : null;
}

function parseAccess(raw: unknown): AccessLevel | null {
  const s = String(raw ?? "").trim();
  return (ALL_ACCESS_LEVELS as readonly string[]).includes(s)
    ? (s as AccessLevel)
    : null;
}

function revalidate() {
  // Sidebar permissions live in (app)/layout.tsx, so every page in the
  // group needs to be re-evaluated. Hitting the layout's own path forces
  // Next to re-run the layout on next nav.
  revalidatePath("/", "layout");
  revalidatePath("/system/permissions");
}

/**
 * Update one cell in the role × menu_key grid.
 *
 * Form fields:
 *   role      — Role enum value
 *   menu_key  — must be in MENU_KEY_SET
 *   access    — 'hidden' | 'read_only' | 'full'
 */
export async function setMenuPermission(
  fd: FormData,
): Promise<MenuPermissionsActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const role = parseRole(fd.get("role"));
  const menuKey = String(fd.get("menu_key") ?? "").trim();
  const access = parseAccess(fd.get("access"));

  if (!role) return { ok: false, error: "Unknown role" };
  if (!menuKey || !MENU_KEY_SET.has(menuKey)) {
    return { ok: false, error: `Unknown menu_key: ${menuKey}` };
  }
  if (!access) return { ok: false, error: "Unknown access level" };

  const uid = await currentUserId();
  const admin = createServiceClient();

  const { error } = await admin.from("role_menu_permissions").upsert(
    {
      role,
      menu_key: menuKey,
      access,
      updated_at: new Date().toISOString(),
      updated_by: uid,
    },
    { onConflict: "role,menu_key" },
  );

  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

/**
 * Wipe every row and re-seed from DEFAULT_PERMISSIONS. Use when the grid
 * has been heavily customised and the publisher wants to start over.
 *
 * Implementation: upsert every (role, menu_key) pair to its default. This
 * also fills any gaps introduced by a new menu item that the publisher
 * hasn't seen yet, without nuking unrelated customisations on adjacent
 * rows (because every row gets rewritten to its default value).
 */
export async function resetMenuPermissionsToDefaults(): Promise<MenuPermissionsActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const uid = await currentUserId();
  const now = new Date().toISOString();
  const rows: Array<{
    role: Role;
    menu_key: string;
    access: AccessLevel;
    updated_at: string;
    updated_by: string | null;
  }> = [];
  for (const role of ALL_ROLES) {
    for (const menuKey of MENU_KEYS) {
      rows.push({
        role,
        menu_key: menuKey,
        access: DEFAULT_PERMISSIONS[role][menuKey] ?? "hidden",
        updated_at: now,
        updated_by: uid,
      });
    }
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from("role_menu_permissions")
    .upsert(rows, { onConflict: "role,menu_key" });
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}
