"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, X, ExternalLink, Paperclip, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCandidatePreview,
  type CandidatePreview,
} from "@/lib/actions/candidate-preview";

/**
 * Read the story before deciding on it.
 *
 * The inbox row carries a headline and some state chips, which is enough to
 * sort but not enough to judge — especially for a press release, where the
 * question is usually "is there a story in this, and is there a usable
 * picture" and the answer is in the body.
 *
 * Slides over the table rather than replacing it, so the row you were looking
 * at is still there when it closes. Content is fetched when opened, not with
 * the list.
 */

export function CandidatePreviewButton({
  candidateId,
  label = "Preview",
}: {
  candidateId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Read the full record before deciding"
        className="inline-flex h-6 items-center gap-1 rounded-sm border border-border bg-background px-2 text-[10.5px] font-medium text-fg-2 transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Eye className="h-3 w-3" />
        {label}
      </button>
      {open ? (
        <CandidatePreviewPanel candidateId={candidateId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function CandidatePreviewPanel({
  candidateId,
  onClose,
}: {
  candidateId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<CandidatePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getCandidatePreview(candidateId).then((r) => {
      if (!live) return;
      if (r.ok) setData(r.preview);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [candidateId]);

  // Escape closes, and the body must not scroll behind the panel.
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );
  useEffect(() => {
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onKey]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="flex-1 cursor-default bg-black/40"
      />
      <aside className="flex h-full w-full max-w-[640px] flex-col border-l border-border bg-card shadow-2xl">
        <header className="flex flex-shrink-0 items-start gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10.5px] font-semibold tracking-wide text-um-muted">
              {data?.code ?? "…"}
            </div>
            <h2 className="mt-0.5 text-[14px] font-semibold leading-snug text-foreground">
              {data?.headline ?? (error ? "Could not load" : "Loading…")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            className="rounded-sm border border-border p-1 text-um-muted transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <p className="text-[12.5px] text-destructive">{error}</p>
          ) : !data ? (
            <p className="text-[12.5px] text-um-muted">Loading the record…</p>
          ) : (
            <PreviewBody d={data} />
          )}
        </div>
      </aside>
    </div>
  );
}

function PreviewBody({ d }: { d: CandidatePreview }) {
  const hasImages = d.images.length > 0 || !!d.imageUrl;
  return (
    <div className="flex flex-col gap-4">
      {d.embargoUntil || d.triageState === "held_source" ? (
        <Banner tone="warn" icon={<Clock className="h-3.5 w-3.5" />}>
          <strong>Embargoed.</strong>{" "}
          {d.embargoUntil
            ? `Lifts ${new Date(d.embargoUntil).toLocaleString("en-GB")}`
            : "No lift time could be read — a person has to set one."}
          {d.embargoConfidence ? ` (confidence: ${d.embargoConfidence})` : null}
          {d.embargoEvidence ? (
            <span className="mt-1 block font-mono text-[10.5px] opacity-80">
              “{d.embargoEvidence}”
            </span>
          ) : null}
        </Banner>
      ) : null}

      {d.signalOnly ? (
        <Banner tone="warn" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
          <strong>Signal-only source.</strong> Awareness only — not a drafting
          basis. Per the sourcing rule this needs an independent primary source
          before it can run.
        </Banner>
      ) : null}

      {d.sentToNewsroomAt ? (
        <Banner tone="ok">
          Already sent to the newsroom
          {d.newsroomRecordId ? ` as ${d.newsroomRecordId}` : ""} on{" "}
          {new Date(d.sentToNewsroomAt).toLocaleString("en-GB")}.
        </Banner>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
        <Meta label="Source" value={d.agencyName ?? d.sourceName ?? "—"} />
        {d.fromEmail ? <Meta label="From" value={d.fromEmail} /> : null}
        {d.author ? <Meta label="Contact" value={d.author} /> : null}
        <Meta label="Arrived" value={new Date(d.surfacedAt).toLocaleString("en-GB")} />
        {d.publishedAt ? (
          <Meta label="Dated" value={new Date(d.publishedAt).toLocaleString("en-GB")} />
        ) : null}
        <Meta
          label="State"
          value={`${d.triageState} · ${d.dedupState} · ${d.verificationState}${
            d.layer ? ` · ${d.layer.toUpperCase()}` : ""
          }${d.score !== null ? ` · ${Math.round(Number(d.score))}/22` : ""}`}
        />
      </dl>

      {d.primaryUrl ? (
        <a
          href={d.primaryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-[11.5px] text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Open the source page
        </a>
      ) : null}

      {hasImages ? (
        <section>
          <SectionLabel>Images</SectionLabel>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {d.imageUrl ? <Figure url={d.imageUrl} name="Lead image" /> : null}
            {d.images.map((a) => (
              <Figure key={a.url ?? a.name} url={a.url as string} name={a.name} size={a.size} />
            ))}
          </div>
        </section>
      ) : null}

      {d.otherFiles.length > 0 ? (
        <section>
          <SectionLabel>Attachments</SectionLabel>
          <ul className="mt-1.5 flex flex-col gap-1">
            {d.otherFiles.map((n) => (
              <li key={n} className="flex items-center gap-1.5 text-[11.5px] text-fg-2">
                <Paperclip className="h-3 w-3 flex-shrink-0 text-um-muted" />
                <span className="truncate" title={n}>{n}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10.5px] text-um-muted">
            Documents are not stored — their text is extracted into the body below.
          </p>
        </section>
      ) : null}

      <section>
        <SectionLabel>Content</SectionLabel>
        {d.body ? (
          <div className="mt-1.5 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-foreground">
            {d.body}
          </div>
        ) : (
          <p className="mt-1.5 text-[12.5px] text-um-muted">
            No body text — nothing to judge this on beyond the headline.
          </p>
        )}
      </section>
    </div>
  );
}

function Figure({ url, name, size }: { url: string; name: string; size?: number | null }) {
  return (
    <figure className="flex flex-col gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-32 w-full rounded-sm border border-border bg-background object-cover"
      />
      <figcaption className="truncate text-[10.5px] text-um-muted" title={name}>
        {name}
        {size ? ` · ${Math.round(size / 1024)} KB` : ""}
      </figcaption>
    </figure>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
      {children}
    </h3>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-um-muted">{label}</dt>
      <dd className="break-words text-fg-2">{value}</dd>
    </>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "warn" | "ok";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-[11.5px]",
        tone === "warn"
          ? "border-warn/40 bg-warn/10 text-warn"
          : "border-success/35 bg-success/10 text-success",
      )}
    >
      {icon ? <span className="mt-0.5 flex-shrink-0">{icon}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
