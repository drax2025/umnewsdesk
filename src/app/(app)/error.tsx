"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Route-segment error boundary for the (app) shell.
 *
 * Without this, any uncaught server / client error inside the editorial
 * app falls through to Next.js's generic "A server error occurred. Reload
 * to try again." chrome, which gives the editor no idea what broke.
 *
 * This boundary shows the real error message + digest so the function-log
 * line can be matched against the page state immediately. It does NOT
 * pretend the error didn't happen — there's no auto-retry.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console so the editor can copy/paste if needed.
    // Vercel function logs already capture this server-side.
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-[640px] rounded-lg border border-destructive/40 bg-destructive/5 p-6">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <h1 className="text-[14px] font-semibold text-foreground">
            Something broke in this view
          </h1>
        </div>

        <p className="mb-3 text-[12.5px] leading-[1.55] text-fg-2">
          The previous action completed (it&apos;s safe to assume the database
          write succeeded), but rendering the next view threw. The actual
          error is below — paste it into the next message if it&apos;s not
          obvious what to do.
        </p>

        <div className="mb-3 space-y-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-[11px] leading-[1.5] text-foreground">
          <div>
            <span className="text-um-muted">message:</span> {error.message}
          </div>
          {error.digest ? (
            <div>
              <span className="text-um-muted">digest:</span> {error.digest}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="flex h-8 items-center gap-1.5 rounded-md border border-primary/45 bg-primary/10 px-3 text-[12px] font-semibold text-primary hover:bg-primary/15"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </button>
          <span className="text-[10.5px] text-um-muted">
            If &quot;Try again&quot; loops back to this page, the bug is in
            the page render, not the action — flag it.
          </span>
        </div>
      </div>
    </div>
  );
}
