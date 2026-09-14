"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * "Have we hydrated yet", without setting state in an effect.
 *
 * The server cannot know which theme the browser will resolve to, so drawing
 * the real icon during SSR guarantees the wrong one on first paint and a
 * hydration mismatch in the console. The usual fix is a mounted flag set from
 * useEffect, which this codebase bans — see the clock in app-topbar.tsx for
 * the same problem solved the same way. Nothing ever changes after hydration,
 * so subscribe is a no-op.
 */
const noop = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noop, onClient, onServer);

  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={mounted ? label : "Theme"}
      aria-label={mounted ? label : "Theme"}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-transparent text-fg-2 transition-colors hover:bg-secondary hover:text-foreground"
    >
      {mounted ? (
        isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />
      ) : (
        <span className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}
