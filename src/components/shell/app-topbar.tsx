"use client";

import { useEffect, useState } from "react";
import { Bell, LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";

type Props = {
  title: string;
  userInitials: string;
};

export function AppTopbar({ title, userInitials }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
