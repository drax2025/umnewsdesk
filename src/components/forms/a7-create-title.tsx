"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import {
  createTitle,
  type TitleConfigActionResult,
} from "@/lib/actions/title-config";

export function CreateTitleForm() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 text-[11.5px] font-semibold text-primary hover:bg-primary/15"
      >
        <Plus className="h-3 w-3" />
        New title
      </button>
      {open ? <Dialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Dialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("name", name);
    fd.set("domain", domain);
    startTransition(async () => {
      const res: TitleConfigActionResult = await createTitle(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      if (res.id) router.push(`/system/titles/${res.id}`);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <header className="flex items-center justify-between border-b border-border bg-background/30 px-4 py-2">
          <h2 className="text-[12.5px] font-semibold text-foreground">
            New publication silo
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-um-muted hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-4">
          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              Slug *
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))
              }
              placeholder="union-media-tech"
              maxLength={60}
              className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 font-mono text-[12px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
            />
            <p className="mt-0.5 text-[10.5px] text-um-muted">
              URL identifier — lowercase, hyphens only. Cannot be changed
              later without DB surgery.
            </p>
          </div>
          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              Display name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Union Media Tech"
              maxLength={120}
              className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              Domain
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="tech.unionmedia.example"
              maxLength={240}
              className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
            />
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[11.5px] text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border bg-background/30 px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-8 rounded-md border border-border bg-background px-3 text-[11.5px] text-fg-2 hover:bg-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 text-[11.5px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Create
          </button>
        </footer>
      </div>
    </div>
  );
}
