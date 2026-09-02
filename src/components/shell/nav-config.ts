/**
 * Left-hand nav catalog.
 *
 * Each item carries a stable `key` slug that's the source of truth for the
 * permissions system (role_menu_permissions.menu_key). Labels and hrefs can
 * be renamed without resetting saved per-role access — the key is what's
 * persisted in the DB.
 *
 * Adding a new nav item is a three-step ritual:
 *   1. add it here with a fresh `key` and a valid `iconName`
 *   2. add an INSERT row for each role in supabase/migrations/0034…sql
 *      (or a follow-up migration if 0034 is already applied)
 *   3. add a sensible default to DEFAULT_PERMISSIONS in
 *      src/lib/spec/menu-permissions.ts
 *
 * IMPORTANT: `iconName` is a string, NOT a LucideIcon reference. The
 * sidebar maps the string to the actual component on the client. This
 * lets a Server Component build the nav and pass it across the
 * server/client boundary without tripping Next 16's "Functions cannot be
 * passed directly to Client Components" guard — see commit 71e7659 and
 * the prior 500-storm for the rationale.
 */

export type NavIconName =
  | "LayoutGrid"
  | "Search"
  | "Inbox"
  | "AlertTriangle"
  | "Clock"
  | "Cog"
  | "Activity"
  | "ScrollText"
  | "TestTube2"
  | "Newspaper"
  | "Users"
  | "Building2"
  | "Settings"
  | "Lock";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  iconName: NavIconName;
  badge?: { value: number | string; urgent?: boolean };
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", href: "/", iconName: "LayoutGrid" },
    ],
  },
  {
    label: "Discovery",
    items: [
      { key: "discovery_overview", label: "Discovery Overview", href: "/discovery", iconName: "Search" },
      { key: "candidate_inbox", label: "Candidate Inbox", href: "/discovery/inbox", iconName: "Inbox" },
      { key: "ops_rr_queue", label: "OPS-RR Queue", href: "/discovery/ops-rr", iconName: "AlertTriangle" },
      { key: "sweep_run_detail", label: "Sweep Run Detail", href: "/discovery/sweeps", iconName: "Clock" },
    ],
  },
  {
    label: "Admin",
    items: [
      { key: "system_discovery_config", label: "Discovery Config", href: "/system/discovery-config", iconName: "Cog" },
      { key: "system_source_health", label: "Source Health Monitor", href: "/system/source-health", iconName: "Activity" },
      { key: "system_audit_log", label: "Discovery Audit Log", href: "/system/audit-log", iconName: "ScrollText" },
      { key: "system_test_ingest", label: "Test Ingest", href: "/system/test-ingest", iconName: "TestTube2" },
      { key: "system_titles", label: "Titles", href: "/system/titles", iconName: "Newspaper" },
      { key: "team", label: "Team", href: "/team", iconName: "Users" },
      { key: "press_agencies", label: "Press Agencies", href: "/team/agencies", iconName: "Building2" },
      { key: "system_settings", label: "Settings", href: "/system/settings", iconName: "Settings" },
      { key: "system_permissions", label: "Permissions", href: "/system/permissions", iconName: "Lock" },
    ],
  },
];
