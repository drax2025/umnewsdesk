"use client";

import { Fragment, useState, useTransition } from "react";
import { Lock, Eye, CircleCheck, RotateCcw, Loader2 } from "lucide-react";
import {
  setMenuPermission,
  resetMenuPermissionsToDefaults,
} from "@/lib/actions/menu-permissions";
import {
  ACCESS_LABEL,
  ALL_ACCESS_LEVELS,
  ALL_ROLES,
  MENU_CATALOG,
  ROLE_LABEL,
  type AccessLevel,
  type MenuCatalogEntry,
  type Role,
} from "@/lib/spec/menu-permissions";
import { cn } from "@/lib/utils";

/**
 * Grid editor for role × menu_key × access. Rows are nav items (grouped
 * by section header), columns are the four roles. Each cell is a tiny
 * select that submits the change to the server action on change.
 *
 * Senior Editor's column renders as a read-only "Full" badge — the
 * resolver hardcodes that role to 'full' anyway, so allowing edits would
 * just be confusing theatre.
 *
 * Optimistic state: we keep `local` synced with the latest known server
 * value and flip a cell to its new value the moment the select fires.
 * If the server returns an error we roll the cell back and surface a
 * banner. No global save button — granular per-cell saves match the
 * mental model of "tweak one thing, move on".
 */

type InitialMap = Record<Role, Record<string, AccessLevel>>;

type Props = {
  initial: InitialMap;
};

function AccessGlyph({ access }: { access: AccessLevel }) {
  if (access === "hidden")
    return <Eye className="h-3 w-3 opacity-40" aria-hidden />;
  if (access === "read_only")
    return <Lock className="h-3 w-3 text-warn" aria-hidden />;
  return <CircleCheck className="h-3 w-3 text-success" aria-hidden />;
}

export function RolePermissionsEditor({ initial }: Props) {
  const [local, setLocal] = useState<InitialMap>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerOK, setBannerOK] = useState<string | null>(null);
  const [resetting, startReset] = useTransition();

  const sectionGroups: Array<{ label: string; items: MenuCatalogEntry[] }> =
    [];
  for (const entry of MENU_CATALOG) {
    const last = sectionGroups[sectionGroups.length - 1];
    if (last && last.label === entry.section) {
      last.items.push(entry);
    } else {
      sectionGroups.push({ label: entry.section, items: [entry] });
    }
  }

  async function onCellChange(
    role: Role,
    menuKey: string,
    next: AccessLevel,
  ) {
    const previous = local[role][menuKey];
    setBannerError(null);
    setBannerOK(null);

    // Optimistic update.
    setLocal((prev) => ({
      ...prev,
      [role]: { ...prev[role], [menuKey]: next },
    }));
    setBusy(`${role}:${menuKey}`);

    try {
      const fd = new FormData();
      fd.set("role", role);
      fd.set("menu_key", menuKey);
      fd.set("access", next);
      const res = await setMenuPermission(fd);
      if (!res.ok) {
        // Roll back.
        setLocal((prev) => ({
          ...prev,
          [role]: { ...prev[role], [menuKey]: previous },
        }));
        setBannerError(res.error);
      } else {
        setBannerOK(
          `${ROLE_LABEL[role]} · ${menuKey} → ${ACCESS_LABEL[next]}`,
        );
      }
    } finally {
      setBusy(null);
    }
  }

  function onReset() {
    if (
      !confirm(
        "Reset every cell to the seeded defaults? This overrides every per-role customisation.",
      )
    ) {
      return;
    }
    setBannerError(null);
    setBannerOK(null);
    startReset(async () => {
      const res = await resetMenuPermissionsToDefaults();
      if (!res.ok) {
        setBannerError(res.error);
        return;
      }
      // The server revalidates the layout, but we still need fresh local
      // state for the grid. Easiest: reload — the page re-fetches as a
      // Server Component and rebuilds `initial`. The user's tab stays put.
      window.location.reload();
    });
  }

  return (
    <div className="space-y-3">
      {bannerError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11.5px] text-destructive">
          {bannerError}
        </div>
      ) : null}
      {bannerOK && !bannerError ? (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[11.5px] text-success">
          Saved: {bannerOK}
        </div>
      ) : null}

      <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-background/40 px-3 py-2 text-[11px] text-um-muted">
        <span className="font-semibold uppercase tracking-[0.06em] text-fg-2">
          Legend
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AccessGlyph access="hidden" /> Hidden in nav
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AccessGlyph access="read_only" /> Visible · read-only
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AccessGlyph access="full" /> Visible · full access
        </span>
        <button
          type="button"
          onClick={onReset}
          disabled={resetting}
          className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
        >
          {resetting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          Reset to defaults
        </button>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border bg-background/40 text-left">
              <th className="px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                Menu item
              </th>
              {ALL_ROLES.map((role) => (
                <th
                  key={role}
                  className="px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted"
                >
                  {ROLE_LABEL[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectionGroups.map((group) => (
              <Fragment key={group.label}>
                <tr className="bg-background/30">
                  <td
                    colSpan={1 + ALL_ROLES.length}
                    className="border-y border-border px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.items.map((entry) => (
                  <tr
                    key={entry.key}
                    className="border-b border-border hover:bg-background/30"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">
                        {entry.label}
                      </div>
                      <div className="font-mono text-[10.5px] text-um-muted">
                        {entry.href}
                      </div>
                    </td>
                    {ALL_ROLES.map((role) => {
                      const value = local[role][entry.key] ?? "hidden";
                      const cellBusy = busy === `${role}:${entry.key}`;
                      const seniorLocked = role === "senior_editor";
                      return (
                        <td key={role} className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <AccessGlyph access={value} />
                            <select
                              value={value}
                              disabled={cellBusy || seniorLocked}
                              onChange={(e) =>
                                void onCellChange(
                                  role,
                                  entry.key,
                                  e.target.value as AccessLevel,
                                )
                              }
                              className={cn(
                                "h-7 flex-1 rounded-sm border border-border bg-background px-2 text-[11.5px] focus:border-primary focus:outline-none",
                                cellBusy && "opacity-60",
                                seniorLocked &&
                                  "cursor-not-allowed bg-secondary/40 text-um-muted",
                              )}
                              title={
                                seniorLocked
                                  ? "Senior Editor is always full access (lockout safety)"
                                  : undefined
                              }
                            >
                              {ALL_ACCESS_LEVELS.map((lvl) => (
                                <option key={lvl} value={lvl}>
                                  {ACCESS_LABEL[lvl]}
                                </option>
                              ))}
                            </select>
                            {cellBusy ? (
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
