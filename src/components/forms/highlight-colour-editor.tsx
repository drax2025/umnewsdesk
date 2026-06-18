"use client";

import { useState, useTransition } from "react";
import { Loader2, Palette, RotateCcw } from "lucide-react";
import { saveHighlightColour } from "@/lib/actions/branding";

/**
 * Admin control for the global "highlight colour" — the background
 * applied to selected options (e.g. the F1 triage scorecard pills). Stored in
 * app_settings and surfaced app-wide via the --um-highlight CSS variable set
 * in the (app) layout.
 */

const DEFAULT_SWATCH = "#2563eb";

export function HighlightColourEditor({
  initialColour,
}: {
  initialColour: string | null;
}) {
  const [colour, setColour] = useState<string>(initialColour ?? DEFAULT_SWATCH);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function persist(value: string | "") {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("colour", value);
      const res = await saveHighlightColour(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(value ? "Highlight colour saved." : "Reverted to the default accent.");
    });
  }

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border bg-background/40 px-4 py-2.5">
        <Palette className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[12px] font-semibold text-foreground">
          Highlight colour
        </h2>
      </header>

      <div className="space-y-4 p-4">
        <p className="text-[12px] leading-[1.5] text-um-muted">
          Background for selected options across the newsroom — for example the
          chosen pills on the F1 triage scorecard. Leave it on the default to
          use the built-in accent.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={colour}
            disabled={pending}
            onChange={(e) => setColour(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-md border border-border bg-background p-0.5 disabled:opacity-60"
            aria-label="Highlight colour"
          />
          <input
            type="text"
            value={colour}
            disabled={pending}
            onChange={(e) => setColour(e.target.value)}
            maxLength={9}
            placeholder="#2563eb"
            className="h-9 w-[120px] rounded-md border border-border bg-background px-2.5 font-mono text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary focus:outline-none disabled:opacity-60"
          />
          {/* Live swatch preview */}
          <span
            className="inline-flex h-9 items-center rounded-md border border-primary/45 px-3 text-[11.5px] font-medium text-foreground"
            style={{ backgroundColor: colour }}
          >
            Selected option
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => persist(colour)}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 text-[12px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save colour
            </button>
            <button
              type="button"
              onClick={() => {
                setColour(DEFAULT_SWATCH);
                persist("");
              }}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[12px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Default
            </button>
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
            {error}
          </p>
        ) : null}
        {notice && !error ? (
          <p className="rounded-md border border-success/35 bg-success/10 px-2.5 py-1.5 text-[11.5px] text-success">
            {notice}
          </p>
        ) : null}
      </div>
    </section>
  );
}
