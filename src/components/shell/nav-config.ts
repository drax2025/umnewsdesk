import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  Workflow,
  Columns3,
  Calendar,
  ClipboardList,
  FileText,
  CheckSquare,
  Users,
  Search,
  Inbox,
  AlertTriangle,
  Clock,
  Activity,
  Cog,
  ScrollText,
  Grid2x2,
  Settings,
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
    ],
  },
  {
    label: "Management",
    items: [
      { label: "Approvals", href: "/approvals", icon: CheckSquare },
      { label: "Team", href: "/team", icon: Users },
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
      { label: "Discovery Config", href: "/system/discovery-config", icon: Cog },
      { label: "Source Health Monitor", href: "/system/source-health", icon: Activity },
      { label: "Discovery Audit Log", href: "/system/audit-log", icon: ScrollText },
      { label: "Design System", href: "/system/design", icon: Grid2x2 },
      { label: "Settings", href: "/system/settings", icon: Settings },
    ],
  },
];
