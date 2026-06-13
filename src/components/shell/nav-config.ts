import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  Workflow,
  Columns3,
  Calendar,
  ClipboardList,
  FileText,
  CheckSquare,
  Package,
  ShieldAlert,
  Siren,
  Users,
  Building2,
  Search,
  Inbox,
  AlertTriangle,
  Clock,
  Activity,
  Cog,
  ScrollText,
  Grid2x2,
  Settings,
  TestTube2,
  Sparkles,
  Library,
  ListTodo,
  Newspaper,
  FileWarning,
  Lock,
} from "lucide-react";

/**
 * Left-hand nav catalog.
 *
 * Each item carries a stable `key` slug that's the source of truth for the
 * permissions system (role_menu_permissions.menu_key). Labels and hrefs can
 * be renamed without resetting saved per-role access — the key is what's
 * persisted in the DB.
 *
 * Adding a new nav item is a three-step ritual:
 *   1. add it here with a fresh `key`
 *   2. add an INSERT row for each role in supabase/migrations/0034…sql
 *      (or a follow-up migration if 0034 is already applied)
 *   3. add a sensible default to DEFAULT_PERMISSIONS in
 *      src/lib/spec/menu-permissions.ts
 */

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
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
      { key: "dashboard", label: "Dashboard", href: "/", icon: LayoutGrid },
    ],
  },
  {
    label: "Editorial",
    items: [
      { key: "pipeline", label: "Pipeline", href: "/pipeline", icon: Workflow },
      { key: "board", label: "Board", href: "/board", icon: Columns3 },
      { key: "commissioning", label: "Commissioning", href: "/commissioning", icon: ClipboardList },
      { key: "calendar", label: "Calendar", href: "/calendar", icon: Calendar },
      { key: "article_dossier", label: "Article Dossier", href: "/articles", icon: FileText },
      { key: "inventory", label: "Master Inventory (A2)", href: "/inventory", icon: Library },
      { key: "opportunities", label: "Opportunities (A3 / K5)", href: "/opportunities", icon: ListTodo },
      { key: "f5_edit_preview", label: "F5 Edit (preview)", href: "/design/f5-edit", icon: Sparkles },
    ],
  },
  {
    label: "Management",
    items: [
      { key: "approvals", label: "Approvals", href: "/approvals", icon: CheckSquare },
      { key: "pre_publish", label: "Pre-Publish [PUB]", href: "/approvals/pre-publish", icon: Package },
      { key: "d_reject_queue", label: "D-Reject Queue", href: "/queues/reject", icon: ShieldAlert },
      { key: "corrections", label: "Corrections (Stage 13)", href: "/corrections", icon: FileWarning },
      { key: "d0_escalation", label: "D0 Escalation [ESC]", href: "/queues/escalation", icon: Siren },
      { key: "team", label: "Team", href: "/team", icon: Users },
      { key: "press_agencies", label: "Press Agencies", href: "/team/agencies", icon: Building2 },
    ],
  },
  {
    label: "Discovery",
    items: [
      { key: "discovery_overview", label: "Discovery Overview", href: "/discovery", icon: Search },
      { key: "candidate_inbox", label: "Candidate Inbox", href: "/discovery/inbox", icon: Inbox },
      { key: "ops_rr_queue", label: "OPS-RR Queue", href: "/discovery/ops-rr", icon: AlertTriangle },
      { key: "sweep_run_detail", label: "Sweep Run Detail", href: "/discovery/sweeps", icon: Clock },
    ],
  },
  {
    label: "System",
    items: [
      { key: "system_titles", label: "Titles (Section G)", href: "/system/titles", icon: Newspaper },
      { key: "system_discovery_config", label: "Discovery Config", href: "/system/discovery-config", icon: Cog },
      { key: "system_source_health", label: "Source Health Monitor", href: "/system/source-health", icon: Activity },
      { key: "system_audit_log", label: "Discovery Audit Log", href: "/system/audit-log", icon: ScrollText },
      { key: "system_test_ingest", label: "Test Ingest", href: "/system/test-ingest", icon: TestTube2 },
      { key: "system_design", label: "Design System", href: "/system/design", icon: Grid2x2 },
      { key: "system_settings", label: "Settings", href: "/system/settings", icon: Settings },
      { key: "system_permissions", label: "Permissions", href: "/system/permissions", icon: Lock },
    ],
  },
];
