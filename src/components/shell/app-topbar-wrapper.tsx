"use client";

import { AppTopbar } from "./app-topbar";
import { usePageTitle } from "./page-title";

export function AppTopbarWrapper({ userInitials }: { userInitials: string }) {
  const title = usePageTitle();
  return <AppTopbar title={title} userInitials={userInitials} />;
}
