import { createClient } from "@/lib/supabase/server";

/**
 * Login-screen branding. Read on the unauthenticated /login page (anon read is
 * allowed for the 'login_wallpaper' key — see migration 0037) and on the
 * Senior-Editor settings page.
 *
 * `overlay` is a 0–0.9 scrim opacity laid over the wallpaper so the sign-in
 * card and text stay legible over a busy photo.
 */

export type LoginWallpaper = { url: string | null; overlay: number };

export const DEFAULT_WALLPAPER_OVERLAY = 0.55;

function clampOverlay(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_WALLPAPER_OVERLAY;
  return Math.min(Math.max(n, 0), 0.9);
}

/**
 * Global "highlight colour" used to background selected options (e.g. the F1
 * triage scorecard). Set on the Settings page. Returns null when unset, so the
 * UI can fall back to its built-in accent.
 */
export async function getHighlightColour(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "highlight_colour")
      .maybeSingle<{ value: { colour?: string | null } | null }>();
    const c = data?.value?.colour;
    return typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
  } catch {
    return null;
  }
}

export async function getLoginWallpaper(): Promise<LoginWallpaper> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "login_wallpaper")
      .maybeSingle<{ value: { url?: string | null; overlay?: number } | null }>();
    const v = data?.value ?? null;
    const url = typeof v?.url === "string" && v.url.trim() ? v.url : null;
    return { url, overlay: clampOverlay(v?.overlay) };
  } catch {
    // Missing table (migration not applied) / network blip — fall back to the
    // plain grid background rather than 500 the login page.
    return { url: null, overlay: DEFAULT_WALLPAPER_OVERLAY };
  }
}
