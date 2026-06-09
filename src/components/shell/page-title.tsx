"use client";

import { usePathname } from "next/navigation";
import { NAV_SECTIONS } from "./nav-config";

export function usePageTitle(): string {
  const pathname = usePathname();
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (
        item.href === "/"
          ? pathname === "/"
          : pathname.startsWith(item.href)
      ) {
        return item.label;
      }
    }
  }
  return "Union Media";
}
