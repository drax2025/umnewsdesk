"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_WALLPAPER_OVERLAY } from "@/lib/branding";

/**
 * Branding settings actions (Admin only). Currently just the custom
 * login-screen wallpaper. The browser uploads the image straight to the
 * public `branding` storage bucket; these actions persist the resulting URL
 * (plus the scrim overlay) into app_settings under the 'login_wallpaper' key.
 */

export type BrandingActionResult = { ok: true } | { ok: false; error: string };

async function requireSeniorEditor(): Promise<BrandingActionResult | null> {
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
  if (me?.role !== "admin") {
    return { ok: false, error: "Only admins can change branding" };
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

function clampOverlay(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_WALLPAPER_OVERLAY;
  return Math.min(Math.max(n, 0), 0.9);
}

function revalidate() {
  revalidatePath("/system/settings");
  revalidatePath("/login");
}

export async function saveLoginWallpaper(
  fd: FormData,
): Promise<BrandingActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const url = String(fd.get("url") ?? "").trim();
  if (!url) return { ok: false, error: "Missing image URL" };
  const overlay = clampOverlay(fd.get("overlay"));

  const admin = createServiceClient();
  const { error } = await admin.from("app_settings").upsert(
    {
      key: "login_wallpaper",
      value: { url, overlay },
      updated_at: new Date().toISOString(),
      updated_by: await currentUserId(),
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function updateWallpaperOverlay(
  fd: FormData,
): Promise<BrandingActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const overlay = clampOverlay(fd.get("overlay"));
  const admin = createServiceClient();

  // Preserve the existing URL; only touch the overlay.
  const { data: existing } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "login_wallpaper")
    .maybeSingle<{ value: { url?: string | null } | null }>();
  const url = existing?.value?.url ?? null;
  if (!url) return { ok: false, error: "No wallpaper set yet." };

  const { error } = await admin.from("app_settings").upsert(
    {
      key: "login_wallpaper",
      value: { url, overlay },
      updated_at: new Date().toISOString(),
      updated_by: await currentUserId(),
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function saveHighlightColour(
  fd: FormData,
): Promise<BrandingActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const raw = String(fd.get("colour") ?? "").trim();
  // Accept a hex colour (#rgb / #rrggbb / #rrggbbaa) or empty to clear.
  if (raw && !/^#[0-9a-fA-F]{3,8}$/.test(raw)) {
    return { ok: false, error: "Enter a valid hex colour (e.g. #2563eb)." };
  }

  const admin = createServiceClient();
  const { error } = await admin.from("app_settings").upsert(
    {
      key: "highlight_colour",
      value: { colour: raw || null },
      updated_at: new Date().toISOString(),
      updated_by: await currentUserId(),
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/system/settings");
  // The colour is read in the (app) layout, so every app route reflects it.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function clearLoginWallpaper(): Promise<BrandingActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const admin = createServiceClient();
  const { error } = await admin.from("app_settings").upsert(
    {
      key: "login_wallpaper",
      value: { url: null, overlay: DEFAULT_WALLPAPER_OVERLAY },
      updated_at: new Date().toISOString(),
      updated_by: await currentUserId(),
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}
