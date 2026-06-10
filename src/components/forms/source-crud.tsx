"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createSource,
  deleteSource,
  updateSource,
  type SourceActionResult,
} from "@/lib/actions/sources";
import { cn } from "@/lib/utils";

type Layer = "l1" | "l2" | "l3" | "l4";
type Status = "active" | "warning" | "critical" | "paused";
type CrawlMethod = "rss" | "sitemap" | "html_scrape" | "api";

export type StreamOption = { id: string; name: string };

const LAYERS: Layer[] = ["l1", "l2", "l3", "l4"];
const STATUSES: Status[] = ["active", "warning", "critical", "paused"];
const CRAWL_METHODS: CrawlMethod[] = ["rss", "sitemap", "html_scrape", "api"];

const LAYER_LABEL: Record<Layer, string> = {
  l1: "L1 · official",
  l2: "L2 · trade",
  l3: "L3 · community",
  l4: "L4 · adjacent",
};

const CRAWL_LABEL: Record<CrawlMethod, string> = {
  rss: "RSS",
  sitemap: "Sitemap",
  html_scrape: "HTML scrape",
  api: "API",
};

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const labelCls = "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";

/* -------------------------------------------------------------------------- */
/*  NEW SOURCE                                                                */
/* -------------------------------------------------------------------------- */

export function NewSourceButton({ streams }: { streams: StreamOption[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-state-comm/35 bg-state-comm/10 px-2.5 text-[11.5px] font-medium text-state-comm hover:bg-state-comm/15"
      >
        <Plus className="h-3.5 w-3.5" />
        New source
      </button>
      <SourceDialog ref={ref} title="Add discovery source">
        <NewSourceForm streams={streams} onDone={() => ref.current?.close()} />
      </SourceDialog>
    </>
  );
}

function NewSourceForm({
  streams,
  onDone,
}: {
  streams: StreamOption[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res: SourceActionResult = await createSource(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <div>
        <label className={labelCls} htmlFor="new-name">
          Name
        </label>
        <input
          id="new-name"
          name="name"
          required
          placeholder="e.g. Edinburgh BioQuarter News"
          className={cn(inputCls, "mt-1")}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor="new-feed">
          Feed URL
        </label>
        <input
          id="new-feed"
          name="feed_url"
          required
          type="url"
          placeholder="https://example.com/feed"
          className={cn(inputCls, "mt-1 font-mono text-[11.5px]")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="new-method">
            Crawl method
          </label>
          <select id="new-method" name="crawl_method" defaultValue="rss" className={cn(inputCls, "mt-1")}>
            {CRAWL_METHODS.map((m) => (
              <option key={m} value={m}>
                {CRAWL_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="new-layer">
            Layer
          </label>
          <select id="new-layer" name="layer" defaultValue="l2" className={cn(inputCls, "mt-1")}>
            {LAYERS.map((l) => (
              <option key={l} value={l}>
                {LAYER_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="new-stream">
          Editorial stream
        </label>
        <select id="new-stream" name="stream_id" defaultValue="none" className={cn(inputCls, "mt-1")}>
          <option value="none">— Unassigned —</option>
          {streams.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="new-status">
            Status
          </label>
          <select id="new-status" name="status" defaultValue="active" className={cn(inputCls, "mt-1 capitalize")}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="new-excl">
            Exclusivity (h)
          </label>
          <input
            id="new-excl"
            name="exclusivity_window_hours"
            type="number"
            min={0}
            max={720}
            defaultValue={48}
            className={cn(inputCls, "mt-1 font-mono tabular-nums")}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-[12px] text-fg-2">
        <input type="checkbox" name="signal_only_eligible" className="h-3.5 w-3.5" />
        Signal-only eligible (high-velocity feeds, no full-text capture)
      </label>

      {error ? (
        <div className="rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="h-7 rounded-md border border-border bg-background px-3 text-[11.5px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-7 rounded-md border border-state-comm/35 bg-state-comm/10 px-3 text-[11.5px] font-semibold text-state-comm hover:bg-state-comm/15 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create source"}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  ROW ACTIONS                                                               */
/* -------------------------------------------------------------------------- */

export function SourceRowActions({
  source,
  streams,
}: {
  source: {
    id: string;
    code: string;
    name: string;
    feed_url: string;
    crawl_method: string | null;
    layer: Layer;
    stream_id: string | null;
  };
  streams: StreamOption[];
}) {
  const editRef = useRef<HTMLDialogElement>(null);
  const delRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => editRef.current?.showModal()}
          title="Edit source"
          className="flex h-6 w-6 items-center justify-center rounded-sm border border-border bg-background text-fg-2 hover:bg-secondary hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => delRef.current?.showModal()}
          title="Delete source"
          className="flex h-6 w-6 items-center justify-center rounded-sm border border-border bg-background text-fg-2 hover:bg-destructive/15 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <SourceDialog ref={editRef} title={`Edit ${source.code}`}>
        <EditSourceForm
          source={source}
          streams={streams}
          onDone={() => editRef.current?.close()}
        />
      </SourceDialog>

      <SourceDialog ref={delRef} title={`Delete ${source.code}?`}>
        <DeleteSourceConfirm
          id={source.id}
          name={source.name}
          onDone={() => delRef.current?.close()}
        />
      </SourceDialog>
    </>
  );
}

function EditSourceForm({
  source,
  streams,
  onDone,
}: {
  source: {
    id: string;
    name: string;
    feed_url: string;
    crawl_method: string | null;
    layer: Layer;
    stream_id: string | null;
  };
  streams: StreamOption[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateSource(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  const defaultMethod = (CRAWL_METHODS as readonly string[]).includes(
    source.crawl_method ?? "",
  )
    ? (source.crawl_method as CrawlMethod)
    : "rss";

  return (
    <form action={submit} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={source.id} />

      <div>
        <label className={labelCls} htmlFor="edit-name">
          Name
        </label>
        <input
          id="edit-name"
          name="name"
          required
          defaultValue={source.name}
          className={cn(inputCls, "mt-1")}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor="edit-feed">
          Feed URL
        </label>
        <input
          id="edit-feed"
          name="feed_url"
          required
          type="url"
          defaultValue={source.feed_url}
          className={cn(inputCls, "mt-1 font-mono text-[11.5px]")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="edit-method">
            Crawl method
          </label>
          <select
            id="edit-method"
            name="crawl_method"
            defaultValue={defaultMethod}
            className={cn(inputCls, "mt-1")}
          >
            {CRAWL_METHODS.map((m) => (
              <option key={m} value={m}>
                {CRAWL_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="edit-layer">
            Layer
          </label>
          <select
            id="edit-layer"
            name="layer"
            defaultValue={source.layer}
            className={cn(inputCls, "mt-1")}
          >
            {LAYERS.map((l) => (
              <option key={l} value={l}>
                {LAYER_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="edit-stream">
          Editorial stream
        </label>
        <select
          id="edit-stream"
          name="stream_id"
          defaultValue={source.stream_id ?? "none"}
          className={cn(inputCls, "mt-1")}
        >
          <option value="none">— Unassigned —</option>
          {streams.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[11px] text-um-muted">
        Status, exclusivity window, and signal-only toggle edit in the
        registry row itself — no need to re-open this dialog for them.
      </p>

      {error ? (
        <div className="rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="h-7 rounded-md border border-border bg-background px-3 text-[11.5px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-7 rounded-md border border-primary/35 bg-primary/10 px-3 text-[11.5px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function DeleteSourceConfirm({
  id,
  name,
  onDone,
}: {
  id: string;
  name: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await deleteSource(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-[1.5] text-fg-2">
        This will remove <span className="font-semibold text-foreground">{name}</span>{" "}
        from the registry. Any candidates that originated here keep their rows but
        lose the source link. Sweep history is preserved.
      </p>

      {error ? (
        <div className="rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="h-7 rounded-md border border-border bg-background px-3 text-[11.5px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="h-7 rounded-md border border-destructive/40 bg-destructive/10 px-3 text-[11.5px] font-semibold text-destructive hover:bg-destructive/15 disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete source"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DIALOG SHELL                                                              */
/* -------------------------------------------------------------------------- */

function SourceDialog({
  ref,
  title,
  children,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <dialog
      ref={ref}
      onClick={(e) => {
        // Click on backdrop closes — children stop propagation.
        if (e.target === ref.current) ref.current?.close();
      }}
      className="fixed inset-0 m-auto h-fit w-[460px] max-w-[92vw] rounded-lg border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/40 backdrop:backdrop-blur-sm"
    >
      <div
        className="flex items-center justify-between border-b border-border px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-um-muted hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </dialog>
  );
}
