"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Building2,
  Clock,
  Cog,
  Inbox,
  LayoutGrid,
  Lock,
  Newspaper,
  ScrollText,
  Search,
  Settings,
  TestTube2,
  Users,
} from "lucide-react";
import type { NavIconName } from "@/components/shell/nav-config";
import type { SidebarNavSection } from "@/lib/shell/get-nav-for-role";
import { cn } from "@/lib/utils";

/**
 * iconName → component map. Lives here (in the client component) on
 * purpose: the server-side nav resolver passes only serialisable data
 * (strings, plain objects) across the RSC boundary, then this map
 * resolves the actual React component on render. Passing the component
 * reference itself from server → client trips Next 16's
 * "Functions cannot be passed directly to Client Components" guard.
 */
const ICON_MAP: Record<NavIconName, LucideIcon> = {
  Activity,
  AlertTriangle,
  Building2,
  Clock,
  Cog,
  Inbox,
  LayoutGrid,
  Lock,
  Newspaper,
  ScrollText,
  Search,
  Settings,
  TestTube2,
  Users,
};

type Props = {
  user: {
    fullName: string;
    role: string;
    initials: string;
  };
  /**
   * Pre-filtered nav for the current user's role. The (app) layout resolves
   * this server-side via getNavForRole so this client component never sees
   * items the role isn't supposed to know exist.
   */
  sections: SidebarNavSection[];
};

export function AppSidebar({ user, sections }: Props) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[216px] flex-col overflow-y-auto border-r border-border bg-card row-span-2">
      {/* Publication */}
      <div className="border-b border-border px-4 pt-3.5 pb-3">
        <span className="block text-[13px] font-semibold tracking-[-0.015em]">
          Union Media
        </span>
        <span className="mt-0.5 block font-mono text-[11px] text-um-muted">
          unionmedia.co.uk · Editorial Ops
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="px-4 pt-3.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-um-muted">
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = ICON_MAP[item.iconName];
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              const readOnly = item.accessLevel === "read_only";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-2.5 px-4 py-1.5 text-[13px] transition-colors",
                    active
                      ? "bg-accent text-foreground before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-r-sm before:bg-primary"
                      : "text-fg-2 hover:bg-secondary hover:text-foreground",
                  )}
                  title={
                    readOnly
                      ? `${item.label} — read-only for your role`
                      : item.label
                  }
                >
                  <Icon
                    className={cn(
                      "h-[15px] w-[15px] flex-shrink-0",
                      active ? "opacity-100" : "opacity-65",
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  {readOnly ? (
                    <Lock
                      className="h-3 w-3 flex-shrink-0 text-um-muted"
                      aria-label="read-only"
                    />
                  ) : null}
                  {item.badge ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                        item.badge.urgent
                          ? "bg-destructive/15 text-destructive"
                          : "bg-secondary text-fg-2",
                      )}
                    >
                      {item.badge.value}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
        <div className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full border border-border-mid bg-accent font-mono text-[10px] font-bold text-primary">
          {user.initials}
        </div>
        <div className="min-w-0">
          <span className="block truncate text-[12px] font-medium">
            {user.fullName}
          </span>
          <span className="block text-[11px] text-um-muted">{user.role}</span>
        </div>
      </div>
    </aside>
  );
}
