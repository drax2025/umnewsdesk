"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  clearLoginWallpaper,
  saveLoginWallpaper,
  updateWallpaperOverlay,
  type BrandingActionResult,
} from "@/lib/actions/branding";
import { cn } from "@/lib/utils";

/**
 * Admin control for the custom login-screen wallpaper. The browser
 * uploads the file straight to the public `branding` Supabase Storage bucket
 * (RLS gates writes to admin), then the resulting public URL is
 * persisted via saveLoginWallpaper. The overlay slider tunes the dark scrim
 * that keeps the sign-in card legible over the image.
 */

const BUCKET = "branding";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "wallpaper";
  return base.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80) || "wallpaper";
}

export function LoginWallpaperEditor({
  initialUrl,
  initialOverlay,
}: {
  initialUrl: string | null;
  initialOverlay: number;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [overlay, setOverlay] = useState<number>(initialOverlay);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setNotice(null);
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
      const path = `login/${Date.now()}-${safeFilename(file.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const fd = new FormData();
      fd.set("url", publicUrl);
      fd.set("overlay", String(overlay));
      const res: BrandingActionResult = await saveLoginWallpaper(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUrl(publicUrl);
      setNotice("Wallpaper updated — it's live on the sign-in screen now.");
    } catch (e) {
      setError(`Unexpected error: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  function onPickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function saveOverlay() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("overlay", String(overlay));
      const res = await updateWallpaperOverlay(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice("Overlay saved.");
    });
  }

  function remove() {
    if (!confirm("Remove the custom login wallpaper? The sign-in screen reverts to the default grid background.")) {
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await clearLoginWallpaper();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUrl(null);
      setNotice("Wallpaper removed.");
    });
  }

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border bg-background/40 px-4 py-2.5">
        <ImageIcon className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[12px] font-semibold text-foreground">
          Login screen wallpaper
        </h2>
        {url ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-success">
            <CheckCircle2 className="h-3 w-3" />
            Custom
          </span>
        ) : (
          <span className="ml-auto font-mono text-[10px] text-um-muted">
            Default grid background
          </span>
        )}
      </header>

      <div className="space-y-4 p-4">
        <p className="text-[12px] leading-[1.5] text-um-muted">
          Upload a background image for the staff sign-in screen. Shown to
          everyone before they log in, so keep it on-brand. Recommended: a
          landscape JPEG/PNG at least 1920&nbsp;px wide, under 10&nbsp;MB.
        </p>

        {/* Live preview */}
        <div
          onDragOver={(e) => {
            if (!uploading) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onDrop={onDrop}
          onClick={() => {
            if (!uploading) fileInputRef.current?.click();
          }}
          className={cn(
            "relative flex h-[200px] w-full cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed",
            url ? "border-border bg-background" : "border-border-mid bg-secondary/40",
            !uploading && "hover:border-primary/40",
          )}
        >
          {url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Login wallpaper preview" className="h-full w-full object-cover" />
              {/* Scrim preview at the chosen opacity */}
              <div
                className="absolute inset-0 bg-black"
                style={{ opacity: overlay }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-[10px] border border-white/15 bg-black/40 px-4 py-3 text-center backdrop-blur-sm">
                  <span className="block text-[12px] font-semibold text-white">
                    Sign in to your account
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.04em] text-white/70">
                    card legibility preview
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-um-muted">
              <Upload className="h-6 w-6" />
              <span className="text-[11px] uppercase tracking-wider">Drop or click to upload</span>
            </div>
          )}
          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : null}
        </div>

        {/* Overlay slider — only meaningful once an image exists */}
        {url ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-1 items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
                Scrim {Math.round(overlay * 100)}%
              </span>
              <input
                type="range"
                min={0}
                max={0.9}
                step={0.05}
                value={overlay}
                disabled={pending}
                onChange={(e) => setOverlay(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-primary"
              />
            </label>
            <button
              type="button"
              onClick={saveOverlay}
              disabled={pending}
              className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save overlay
            </button>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={onPickerChange}
          className="hidden"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 text-[12px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-60"
          >
            <Upload className="h-3.5 w-3.5" />
            {url ? "Replace image" : "Upload image"}
          </button>
          {url ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 text-[12px] font-medium text-destructive hover:bg-destructive/15 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
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
