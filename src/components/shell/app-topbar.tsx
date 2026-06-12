"use client";

import { useSyncExternalStore } from "react";
import { Bell, LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";

type Props = {
  title: string;
  userInitials: string;
};

// External "store" wrapping setInterval. useSyncExternalStore handles SSR
// (null snapshot until hydrated) without firing setState inside an effect.
//
// IMPORTANT: getSnapshot must return a STABLE value between calls inside the
// same render. Returning `Date.now()` directly is a footgun — React calls
// getSnapshot multiple times per render for tearing detection, and successive
// Date.now() calls differ by microseconds, which makes React think the store
// is changing every render and eventually throws "Maximum update depth
// exceeded" a few seconds after mount. So we cache the timestamp at module
// scope and only update it from inside the setInterval tick (which then
// notifies subscribers and triggers a re-render).
let cachedTimestamp: number | null = null;
const clockListeners = new Set<() => void>();
let clockIntervalId: ReturnType<typeof setInterval> | null = null;

function subscribeToClock(notify: () => void) {
  clockListeners.add(notify);
  if (clockIntervalId === null) {
    cachedTimestamp = Date.now();
    clockIntervalId = setInterval(() => {
      cachedTimestamp = Date.now();
      for (const l of clockListeners) l();
    }, 1000);
    // Initial notify so the first render after subscribe picks up the
    // freshly-populated cachedTimestamp instead of waiting a full second.
    notify();
  }
  return () => {
    clockListeners.delete(notify);
    if (clockListeners.size === 0 && clockIntervalId !== null) {
      clearInterval(clockIntervalId);
      clockIntervalId = null;
    }
  };
}
function getClockSnapshot(): number | null {
  return cachedTimestamp;
}
function getServerClockSnapshot(): number | null {
  return null;
}

export function AppTopbar({ title, userInitials }: Props) {
  const ts = useSyncExternalStore(
    subscribeToClock,
    getClockSnapshot,
    getServerClockSnapshot,
  );
  const now = ts !== null ? new Date(ts) : null;

  return (
    <header className="flex h-12 items-center gap-2.5 border-b border-border bg-card px-4">
      <span className="flex-1 text-[13px] font-semibold tracking-[-0.01em]">
        {title}
      </span>

      {now ? (
        <>
          <span className="font-mono text-[11.5px] text-um-muted">
            {now.toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </span>
          <span className="font-mono text-[11.5px] text-fg-2">
            {now.toLocaleTimeString("en-GB", { hour12: false })}
          </span>
        </>
      ) : null}

      <button
        type="button"
        title="Notifications"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-transparent text-fg-2 transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell className="h-3.5 w-3.5" />
      </button>

      <form action={signOut}>
        <button
          type="submit"
          title="Sign out"
          className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-transparent px-2.5 text-[11.5px] text-fg-2 transition-colors hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </form>

      <div className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-bold text-primary">
        {userInitials}
      </div>
    </header>
  );
}
