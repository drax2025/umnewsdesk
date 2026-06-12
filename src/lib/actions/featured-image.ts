"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Featured-image server actions.
 *
 * The client uploads the binary directly to the `article-images` Supabase
 * Storage bucket (so the request never bounces through this server action),
 * then calls saveFeaturedImage with the resulting public URL plus alt + credit
 * metadata. The bucket's RLS policy gates writes to editor / senior_editor
 * roles; this action re-checks the role server-side so a forged form post
 * with a doctored URL still has to belong to a real editor.
 *
 * clearFeaturedImage detaches the columns and best-effort deletes the storage
 * object — best-effort because the row update is the authoritative state, and
 * an orphaned object in the bucket is a janitor problem, not a publish blocker.
 *
 * On publish, post-publish.ts → publishArticle reads featured_image_url and
 * pushes it to the target title's WP media library, setting featured_media
 * on the post. If featured_image_url is NULL, the publish step falls back to
 * sideloading from candidates.image_url.
 */

export type FeaturedImageActionResult =
  | { ok: true }
  | { ok: false; error: string };

const WRITE_PATHS = (id: string) => [
  `/articles/${id}`,
  `/articles/${id}/edit`,
  `/articles/${id}/review`,
  `/articles/${id}/pre-publish`,
  `/articles/${id}/post-publish`,
];

function revalidate(id: string) {
  for (const p of WRITE_PATHS(id)) revalidatePath(p);
}

async function requireEditor(): Promise<FeaturedImageActionResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string | null }>();
  if (me?.role !== "editor" && me?.role !== "senior_editor") {
    return { ok: false, error: "Editors only" };
  }
  return null;
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function trimOrNull(value: FormDataEntryValue | null, max: number): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

/**
 * Persist the URL of an already-uploaded image plus its alt text and credit.
 *
 * The URL is validated against the configured Supabase Storage public origin
 * so a doctored form post can't park an arbitrary external URL in the column
 * (which would then sideload onto every WP we publish to). The bucket name
 * must also appear in the path — defence in depth against someone uploading
 * a candidate or avatar image into the featured slot.
 */
export async function saveFeaturedImage(
  fd: FormData,
): Promise<FeaturedImageActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const url = String(fd.get("featured_image_url") ?? "").trim();
  const alt = trimOrNull(fd.get("featured_image_alt"), 500);
  const credit = trimOrNull(fd.get("featured_image_credit"), 200);

  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!url) return { ok: false, error: "Missing featured_image_url" };

  // Validate the URL belongs to our own Storage bucket. Anything else (a
  // hotlink to a PR agency CDN, a random external URL) is rejected — the
  // workflow is "upload, then save", not "paste".
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid image URL" };
  }
  if (supabaseUrl) {
    const expected = new URL(supabaseUrl).origin;
    if (parsed.origin !== expected) {
      return { ok: false, error: "Image URL must be from this project's Storage." };
    }
  }
  if (!parsed.pathname.includes("/article-images/")) {
    return { ok: false, error: "Image URL must be in the article-images bucket." };
  }

  const uid = await currentUserId();
  const admin = createServiceClient();
  const { error } = await admin
    .from("articles")
    .update({
      featured_image_url: url,
      featured_image_alt: alt,
      featured_image_credit: credit,
      featured_image_uploaded_at: new Date().toISOString(),
      featured_image_uploaded_by: uid,
    })
    .eq("id", article_id);
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}

/**
 * Update alt + credit on an existing image without re-uploading. Lighter
 * write path for editors fixing a typo in the caption.
 */
export async function updateFeaturedImageMeta(
  fd: FormData,
): Promise<FeaturedImageActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const alt = trimOrNull(fd.get("featured_image_alt"), 500);
  const credit = trimOrNull(fd.get("featured_image_credit"), 200);
  if (!article_id) return { ok: false, error: "Missing article_id" };

  const admin = createServiceClient();
  const { error } = await admin
    .from("articles")
    .update({
      featured_image_alt: alt,
      featured_image_credit: credit,
    })
    .eq("id", article_id);
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}

/**
 * Clear the featured image. Detaches the columns first (authoritative
 * state) then best-effort deletes the storage object. We pull the object
 * path off the URL by stripping the public-object prefix; if the URL
 * shape changes upstream the row clear still wins and an orphaned blob
 * is harmless until cleanup.
 */
export async function clearFeaturedImage(
  fd: FormData,
): Promise<FeaturedImageActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!article_id) return { ok: false, error: "Missing article_id" };

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("articles")
    .select("featured_image_url")
    .eq("id", article_id)
    .maybeSingle<{ featured_image_url: string | null }>();
  const previousUrl = existing?.featured_image_url ?? null;

  const { error } = await admin
    .from("articles")
    .update({
      featured_image_url: null,
      featured_image_alt: null,
      featured_image_credit: null,
      featured_image_uploaded_at: null,
      featured_image_uploaded_by: null,
    })
    .eq("id", article_id);
  if (error) return { ok: false, error: error.message };

  // Best-effort blob delete. Storage public URLs look like
  //   https://<project>.supabase.co/storage/v1/object/public/article-images/<path>
  // We split on the bucket name to recover <path>.
  if (previousUrl) {
    const marker = "/article-images/";
    const idx = previousUrl.indexOf(marker);
    if (idx >= 0) {
      const objectPath = previousUrl.slice(idx + marker.length);
      // Strip any query string (cache busters).
      const clean = objectPath.split("?")[0] ?? objectPath;
      // Don't await the error — the row is already cleared.
      await admin.storage.from("article-images").remove([clean]);
    }
  }

  revalidate(article_id);
  return { ok: true };
}
