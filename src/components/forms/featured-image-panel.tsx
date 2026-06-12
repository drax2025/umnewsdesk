"use client";

import { useRef, useState, useTransition } from "react";
import { Image as ImageIcon, Loader2, Trash2, Upload, AlertTriangle, CheckCircle2, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  clearFeaturedImage,
  saveFeaturedImage,
  setFeaturedImageFromAttachment,
  updateFeaturedImageMeta,
} from "@/lib/actions/featured-image";
import { cn } from "@/lib/utils";

/**
 * Featured-image panel — surfaced on /articles/[id]/edit and (read-only with
 * a swap affordance) on F8 Post-Publish.
 *
 * The browser uploads the file directly to the `article-images` Supabase
 * Storage bucket (RLS gates writes to editor / senior_editor). On success
 * the public URL is sent to saveFeaturedImage, which writes it to the
 * articles row plus alt + credit metadata. Alt text is required for
 * accessibility; credit is optional.
 *
 * Path convention: `<article_id>/<timestamp>-<filename>`. Prefixing with the
 * article UUID keeps blobs grouped per article — which makes the bucket easy
 * to audit and gives clearFeaturedImage a stable place to delete from.
 */

const BUCKET = "article-images";

// 10 MB matches the cap on the bucket migration. Most hero images are
// 200–400 KB; this leaves headroom for the occasional uncompressed PNG.
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type CandidateAttachment = {
  name: string;
  url: string;
  content_type: string;
  size: number;
};

type Props = {
  articleId: string;
  initialUrl: string | null;
  initialAlt: string | null;
  initialCredit: string | null;
  /**
   * Candidate's original image (from RSS / Postmark ingest). Shown as a
   * "fallback image" hint when no editor upload has happened yet, so the
   * writer knows publish won't go out totally blank.
   */
  candidateImageUrl?: string | null;
  /**
   * Image attachments mirrored from the originating Postmark email at ingest
   * time. Rendered as a clickable thumbnail row above the drop zone so the
   * editor can promote one to the featured image without re-uploading.
   * Empty / undefined = hide the picker entirely.
   */
  candidateAttachments?: CandidateAttachment[] | null;
  readOnly?: boolean;
};

function safeFilename(name: string): string {
  // Strip path components and unsafe chars; preserve extension.
  const base = name.split(/[\\/]/).pop() ?? "image";
  return base.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
}

export function FeaturedImagePanel({
  articleId,
  initialUrl,
  initialAlt,
  initialCredit,
  candidateImageUrl = null,
  candidateAttachments = null,
  readOnly = false,
}: Props) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [alt, setAlt] = useState(initialAlt ?? "");
  const [credit, setCredit] = useState(initialCredit ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  // Which attachment thumbnail (by URL) is currently being copied — drives
  // a per-thumb spinner so the editor can see the click landed.
  const [pickingUrl, setPickingUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageAttachments = (candidateAttachments ?? []).filter((a) =>
    a.content_type.startsWith("image/"),
  );

  async function handleFile(file: File) {
    setError(null);
    setSaved(false);

    if (!ALLOWED_MIME.has(file.type)) {
      setError(`Unsupported file type (${file.type || "unknown"}). Use JPEG, PNG, WebP, or GIF.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 10 MB.`);
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${articleId}/${Date.now()}-${safeFilename(file.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        setUploading(false);
        return;
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      // Persist on the article row via the server action so alt + credit get
      // saved in the same write as the URL (no half-saved state where the
      // image exists but alt text is blank).
      const fd = new FormData();
      fd.set("article_id", articleId);
      fd.set("featured_image_url", publicUrl);
      fd.set("featured_image_alt", alt);
      fd.set("featured_image_credit", credit);
      const res = await saveFeaturedImage(fd);
      if (!res.ok) {
        setError(res.error);
        setUploading(false);
        return;
      }

      setUrl(publicUrl);
      setSaved(true);
    } catch (e) {
      setError(`Unexpected error: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  function onPickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset the input so re-picking the same file fires onChange again.
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function onMetaSave() {
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const fd = new FormData();
      fd.set("article_id", articleId);
      fd.set("featured_image_alt", alt);
      fd.set("featured_image_credit", credit);
      const res = await updateFeaturedImageMeta(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
    });
  }

  function onClear() {
    if (!confirm("Remove the featured image? The article will fall back to the candidate's source image on publish if available.")) {
      return;
    }
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const fd = new FormData();
      fd.set("article_id", articleId);
      const res = await clearFeaturedImage(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUrl(null);
      setAlt("");
      setCredit("");
    });
  }

  async function onPickAttachment(attachment: CandidateAttachment) {
    if (readOnly || uploading || pickingUrl) return;
    setError(null);
    setSaved(false);
    setPickingUrl(attachment.url);
    try {
      const fd = new FormData();
      fd.set("article_id", articleId);
      fd.set("source_url", attachment.url);
      // Carry the current alt / credit through. Editor can refine after.
      fd.set("featured_image_alt", alt);
      fd.set("featured_image_credit", credit);
      const res = await setFeaturedImageFromAttachment(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // The server action wrote the row but our local `url` is the candidate-
      // attachments URL, not the new article-images URL. Re-read by triggering
      // a soft refresh through revalidatePath (which the action already does);
      // but our local state needs the final URL too. Easiest: pessimistically
      // mark the panel as "set" with the source URL — on next page render the
      // server-fetched initialUrl will replace it with the canonical one.
      setUrl(attachment.url);
      setSaved(true);
    } finally {
      setPickingUrl(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border bg-background/40 px-3 py-2">
        <ImageIcon className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          Featured image
        </h2>
        {url ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-success">
            <CheckCircle2 className="h-3 w-3" />
            Set
          </span>
        ) : candidateImageUrl ? (
          <span className="ml-auto font-mono text-[10px] text-um-muted">
            Falls back to candidate image on publish
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-warn">
            <AlertTriangle className="h-3 w-3" />
            No image
          </span>
        )}
      </header>

      {imageAttachments.length > 0 && !readOnly ? (
        <div className="border-b border-border bg-secondary/30 px-3 py-2">
          <div className="flex items-center gap-1.5 pb-1.5">
            <Paperclip className="h-3 w-3 text-um-muted" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-um-muted">
              From email attachments
            </span>
            <span className="font-mono text-[10px] text-um-muted">
              ({imageAttachments.length})
            </span>
            <span className="ml-auto font-mono text-[10px] text-um-muted">
              Click to use
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {imageAttachments.map((att) => {
              const isPicking = pickingUrl === att.url;
              return (
                <button
                  key={att.url}
                  type="button"
                  onClick={() => void onPickAttachment(att)}
                  disabled={uploading || pickingUrl !== null}
                  title={`${att.name} — ${(att.size / 1024).toFixed(0)} KB`}
                  className={cn(
                    "group relative h-14 w-14 overflow-hidden rounded-sm border border-border bg-background transition",
                    "hover:border-primary focus:border-primary focus:outline-none",
                    "disabled:cursor-wait disabled:opacity-50",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={att.url}
                    alt={att.name}
                    className="h-full w-full object-cover"
                  />
                  {isPicking ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 p-3 md:grid-cols-[180px_1fr]">
        {/* Preview / drop zone */}
        <div
          onDragOver={(e) => {
            if (!readOnly && !uploading) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onDrop={onDrop}
          className={cn(
            "relative flex h-[120px] w-full items-center justify-center overflow-hidden rounded-md border border-dashed",
            url ? "border-border bg-background" : "border-border-mid bg-secondary/40",
            !readOnly && !uploading && "cursor-pointer hover:border-primary/40",
          )}
          onClick={() => {
            if (!readOnly && !uploading) fileInputRef.current?.click();
          }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={alt || "Featured image preview"}
              className="h-full w-full object-cover"
            />
          ) : candidateImageUrl ? (
            <div className="flex h-full w-full flex-col">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={candidateImageUrl}
                alt="Candidate source image fallback"
                className="h-full w-full object-cover opacity-60"
              />
              <span className="absolute bottom-1 left-1 rounded-sm bg-background/80 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-um-muted">
                Fallback
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-um-muted">
              <Upload className="h-5 w-5" />
              <span className="text-[10px] uppercase tracking-wider">
                Drop or click
              </span>
            </div>
          )}
          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : null}
        </div>

        {/* Metadata */}
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-um-muted">
              Alt text <span className="text-warn">(required for accessibility)</span>
            </span>
            <input
              type="text"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              maxLength={500}
              disabled={readOnly}
              placeholder="e.g. First Minister stands at a podium in front of a Saltire backdrop."
              className="h-7 rounded-sm border border-border bg-background px-2 text-[11.5px] focus:border-primary focus:outline-none disabled:opacity-60"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-um-muted">
              Credit
            </span>
            <input
              type="text"
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              maxLength={200}
              disabled={readOnly}
              placeholder="e.g. Photo: Andrew Cawley / Scottish Government"
              className="h-7 rounded-sm border border-border bg-background px-2 text-[11.5px] focus:border-primary focus:outline-none disabled:opacity-60"
            />
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onPickerChange}
            className="hidden"
          />

          {!readOnly ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-7 items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-60"
              >
                <Upload className="h-3.5 w-3.5" />
                {url ? "Replace image" : "Upload image"}
              </button>
              {url ? (
                <>
                  <button
                    type="button"
                    onClick={onMetaSave}
                    disabled={pending}
                    className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
                  >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Save caption
                  </button>
                  <button
                    type="button"
                    onClick={onClear}
                    disabled={pending}
                    className="inline-flex h-7 items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-2.5 text-[11px] font-medium text-destructive hover:bg-destructive/15 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
              {error}
            </p>
          ) : null}
          {saved && !error ? (
            <p className="text-[11px] text-success">Saved.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
