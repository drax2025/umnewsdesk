import { NAV_SECTIONS } from "@/components/shell/nav-config";

/**
 * Shared types + helpers for the role-based menu permissions system.
 *
 * The DB table `role_menu_permissions` stores `(role, menu_key, access)`
 * rows. This module:
 *   - exposes the role + access enums as TS literal unions,
 *   - derives MENU_CATALOG (flat, with section labels) from NAV_SECTIONS
 *     so the permissions editor and the sidebar filter share one source,
 *   - provides resolveAccess() — the single function any page / sidebar
 *     should call when asking "can this user see/edit this menu item?".
 *
 * The admin → 'full' fallback is hardcoded here, in code, on top
 * of the DB seed. That's the lockout safety net: even if a Admin
 * sets their own row to 'hidden' from /system/permissions, the resolver
 * still hands back 'full'. Without this guarantee a single bad save
 * could lock the publisher out of fixing it.
 */

export type Role = "admin" | "editor" | "reviewer" | "viewer";
export const ALL_ROLES: Role[] = [
  "admin",
  "editor",
  "reviewer",
  "viewer",
];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  editor: "Editor",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

export type AccessLevel = "hidden" | "read_only" | "full";
export const ALL_ACCESS_LEVELS: AccessLevel[] = ["hidden", "read_only", "full"];

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  hidden: "Hidden",
  read_only: "Read-only",
  full: "Full",
};

export type MenuCatalogEntry = {
  key: string;
  section: string;
  label: string;
  href: string;
};

/**
 * Flat list of every nav item with its parent section label. Order
 * matches NAV_SECTIONS so the permissions editor can iterate in the
 * same visual order the sidebar uses.
 */
export const MENU_CATALOG: MenuCatalogEntry[] = NAV_SECTIONS.flatMap((s) =>
  s.items.map((i) => ({
    key: i.key,
    section: s.label,
    label: i.label,
    href: i.href,
  })),
);

export const MENU_KEYS: string[] = MENU_CATALOG.map((m) => m.key);
export const MENU_KEY_SET = new Set(MENU_KEYS);

/**
 * Default access per (role, menu_key) used as a fallback when no DB row
 * exists for a given pair. Matches the seed block in migration 0034, so
 * both fresh installs and runtime defaults agree.
 */
export const DEFAULT_PERMISSIONS: Record<Role, Record<string, AccessLevel>> = {
  admin: Object.fromEntries(MENU_KEYS.map((k) => [k, "full"])),
  editor: Object.fromEntries(
    MENU_KEYS.map((k) => [
      k,
      k.startsWith("system_")
        ? "hidden"
        : k === "team"
          ? "read_only"
          : "full",
    ]),
  ),
  reviewer: Object.fromEntries(
    MENU_KEYS.map((k) => {
      if (k.startsWith("system_") || k === "team" || k === "press_agencies")
        return [k, "hidden"];
      return [k, "read_only"];
    }),
  ),
  // A viewer sees discovery and the dashboard, and nothing that configures
  // anything. The editorial pipeline these used to name was retired with
  // Phase 3 — the keys are gone from NAV_SECTIONS, so naming them here would
  // be describing screens that no longer exist.
  viewer: Object.fromEntries(
    MENU_KEYS.map((k) => {
      if (
        k === "dashboard" ||
        k === "discovery_overview" ||
        k === "candidate_inbox" ||
        k === "ops_rr_queue" ||
        k === "sweep_run_detail"
      )
        return [k, "read_only"];
      return [k, "hidden"];
    }),
  ),
};

/**
 * Resolve the effective access for a (role, menu_key) pair, applying
 * the admin full-access override and falling back to DEFAULT_PERMISSIONS
 * for any key the DB hasn't supplied yet.
 *
 * Pass `permissionMap` as the map of menu_key → AccessLevel returned for the
 * caller's role (built from the role_menu_permissions rows). Pass `null` to
 * skip the DB lookup entirely and use defaults — useful in tests and on the
 * unauthenticated path.
 */
export function resolveAccess(
  role: Role,
  menuKey: string,
  permissionMap: Map<string, AccessLevel> | Record<string, AccessLevel> | null,
): AccessLevel {
  // Lockout safety net — Admin is always full regardless of the row.
  if (role === "admin") return "full";

  if (permissionMap) {
    const fromMap =
      permissionMap instanceof Map
        ? permissionMap.get(menuKey)
        : permissionMap[menuKey];
    if (fromMap) return fromMap;
  }

  return DEFAULT_PERMISSIONS[role][menuKey] ?? "hidden";
}

/**
 * For a given pathname, return the canonical menu_key whose href owns the
 * deepest match. Lets pages ask "what's my own menu permission?" without
 * hardcoding their key.
 *
 * Falls back to null when no nav item owns the path (e.g. /login, deep
 * dynamic routes whose root isn't in the nav).
 */
export function menuKeyForPath(pathname: string): string | null {
  let best: MenuCatalogEntry | null = null;
  for (const entry of MENU_CATALOG) {
    if (entry.href === "/") {
      if (pathname === "/") best = entry;
      continue;
    }
    if (pathname === entry.href || pathname.startsWith(entry.href + "/")) {
      if (!best || entry.href.length > best.href.length) best = entry;
    }
  }
  return best?.key ?? null;
}
