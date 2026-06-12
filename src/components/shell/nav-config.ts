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
} from "lucide-react";

export type NavItem = {
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
    items: [{ label: "Dashboard", href: "/", icon: LayoutGrid }],
  },
  {
    label: "Editorial",
    items: [
      { label: "Pipeline", href: "/pipeline", icon: Workflow },
      { label: "Board", href: "/board", icon: Columns3 },
      { label: "Commissioning", href: "/commissioning", icon: ClipboardList },
      { label: "Calendar", href: "/calendar", icon: Calendar },
      { label: "Article Dossier", href: "/articles", icon: FileText },
      { label: "Master Inventory (A2)", href: "/inventory", icon: Library },
      { label: "Opportunities (A3 / K5)", href: "/opportunities", icon: ListTodo },
      { label: "F5 Edit (preview)", href: "/design/f5-edit", icon: Sparkles },
    ],
  },
  {
    label: "Management",
    items: [
      { label: "Approvals", href: "/approvals", icon: CheckSquare },
      { label: "Pre-Publish [PUB]", href: "/approvals/pre-publish", icon: Package },
      { label: "D-Reject Queue", href: "/queues/reject", icon: ShieldAlert },
      { label: "D0 Escalation [ESC]", href: "/queues/escalation", icon: Siren },
      { label: "Team", href: "/team", icon: Users },
      { label: "Press Agencies", href: "/team/agencies", icon: Building2 },
    ],
  },
  {
    label: "Discovery",
    items: [
      { label: "Discovery Overview", href: "/discovery", icon: Search },
      { label: "Candidate Inbox", href: "/discovery/inbox", icon: Inbox },
      { label: "OPS-RR Queue", href: "/discovery/ops-rr", icon: AlertTriangle },
      { label: "Sweep Run Detail", href: "/discovery/sweeps", icon: Clock },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Titles (Section G)", href: "/system/titles", icon: Newspaper },
      { label: "Discovery Config", href: "/system/discovery-config", icon: Cog },
      { label: "Source Health Monitor", href: "/system/source-health", icon: Activity },
      { label: "Discovery Audit Log", href: "/system/audit-log", icon: ScrollText },
      { label: "Test Ingest", href: "/system/test-ingest", icon: TestTube2 },
      { label: "Design System", href: "/system/design", icon: Grid2x2 },
      { label: "Settings", href: "/system/settings", icon: Settings },
    ],
  },
];
