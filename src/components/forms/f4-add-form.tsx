"use client";

import { useRef, useState, useTransition } from "react";
import { Globe, Link2, Plus, AlertTriangle } from "lucide-react";
import {
  addInterlink,
  type InterlinkActionResult,
} from "@/lib/actions/interlinks";
import { isBannedDomainUrl, type LinkKind } from "@/lib/spec/f4-interlinks";
import { cn } from "@/lib/utils";

/**
 * Add-candidate form. Sits at the bottom of the F4 page. Inserts a new
 * candidate row with kind / URL / anchor / paragraph / title / date.
 * B4 answers and decision are handled later on the row itself.
 */

const labelCls =
  "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";
const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const textareaCls =
  "min-h-[60px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

export function F4AddForm({ articleId }: { articleId: string }) {
  const [kind, setKind] = useState<LinkKind>("internal");
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function submit(fd: FormData) {
    setError(null);
    fd.set("article_id", articleId);
    fd.set("kind", kind);
    startTransition(async () => {
      const res: InterlinkActionResult = await addInterlink(fd);
      if (!res.ok) {
        setError(res.error);
      } else {
        formRef.current?.reset();
        setUrl("");
      }
    });
  }

  const showsBanned = url.length > 0 && isBannedDomainUrl(url);

  return (
    <section className="rounded-lg border border-border bg-card p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <Plus className="h-3.5 w-3.5 text-um-muted" />
        <h2 className="text-[12.5px] font-semibold text-foreground">
          Add candidate
        </h2>
        <span className="text-[10.5px] text-um-muted">
          · internal: B4 reader-first test · outbound: 3-5 official URLs
        </span>
      </div>

      <form ref={formRef} action={submit} className="grid grid-cols-6 gap-2.5">
        <div className="col-span-2">
          <label className={labelCls}>Kind</label>
          <div className="mt-1 flex gap-1">
            <KindBtn current={kind} value="internal" onClick={() => setKind("internal")} />
            <KindBtn current={kind} value="outbound" onClick={() => setKind("outbound")} />
          </div>
        </div>

        <div className="col-span-4">
          <label className={labelCls} htmlFor="add-url">
            Target URL
          </label>
          <input
            id="add-url"
            name="target_url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            className={cn(inputCls, "mt-1 font-mono text-[11.5px]")}
          />
          {showsBanned ? (
            <p className="mt-1 flex items-start gap-1 text-[10.5px] text-destructive">
              <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" />
              <span>
                C7 banned domain (DIGIT / Futurescot / SFN) — cannot be placed.
              </span>
            </p>
          ) : null}
        </div>

        <div className="col-span-3">
          <label className={labelCls} htmlFor="add-title">
            Target title
          </label>
          <input
            id="add-title"
            name="target_title"
            className={cn(inputCls, "mt-1")}
            placeholder="Linked article headline or page title"
          />
        </div>

        <div className="col-span-1">
          <label className={labelCls} htmlFor="add-pub">
            Published
          </label>
          <input
            id="add-pub"
            name="target_published_at"
            type="date"
            className={cn(inputCls, "mt-1 font-mono tabular-nums")}
          />
        </div>

        <div className="col-span-2">
          <label className={labelCls} htmlFor="add-paragraph">
            Paragraph
          </label>
          <input
            id="add-paragraph"
            name="placement_paragraph"
            type="number"
            min={1}
            className={cn(inputCls, "mt-1 font-mono tabular-nums")}
            placeholder="¶"
          />
        </div>

        <div className="col-span-6">
          <label className={labelCls} htmlFor="add-anchor">
            Anchor text
          </label>
          <input
            id="add-anchor"
            name="anchor_text"
            className={cn(inputCls, "mt-1")}
            placeholder="Natural prose — describes what the reader will find."
          />
        </div>

        <div className="col-span-6">
          <label className={labelCls} htmlFor="add-notes">
            Notes
          </label>
          <textarea
            id="add-notes"
            name="notes"
            className={cn(textareaCls, "mt-1")}
            placeholder="Why this candidate matters. Recency. Anchor variants tried."
            maxLength={1200}
          />
        </div>

        <div className="col-span-6 flex items-center justify-between">
          <div className="text-[10.5px] text-um-muted">
            {error ? (
              <span className="text-destructive">{error}</span>
            ) : (
              <span>
                B4 questions + decision are set on the row after it appears.
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="h-8 rounded-md border border-primary/45 bg-primary/15 px-3.5 text-[11.5px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
          >
            {pending ? "Adding…" : "Add candidate"}
          </button>
        </div>
      </form>
    </section>
  );
}

function KindBtn({
  current,
  value,
  onClick,
}: {
  current: LinkKind;
  value: LinkKind;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-[11.5px] font-semibold transition-colors",
        current === value
          ? "border-primary/45 bg-primary/10 text-primary"
          : "border-border bg-background text-fg-2 hover:bg-secondary",
      )}
    >
      {value === "internal" ? (
        <Link2 className="h-3.5 w-3.5" />
      ) : (
        <Globe className="h-3.5 w-3.5" />
      )}
      {value === "internal" ? "Internal" : "Outbound"}
    </button>
  );
}
