"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  GEO_TIERS,
  PRIMARY_FRAMES,
  WP_DEFAULT_STATUSES,
  isValidHexColor,
  isValidHttpsUrl,
  parseListField,
  type GeoTier,
  type PrimaryFrame,
  type WpDefaultStatus,
} from "@/lib/spec/a7-title-config";

/**
 * A7 / Section G — server actions for the per-title configuration surface.
 *
 *   createTitle(fd)          — senior-only. Brand-new publication silo.
 *   updateTitleConfig(fd)    — senior-only. The big editor write.
 *   setTitleActive(fd)       — senior-only. Toggle is_active for phase-2
 *                              launches without losing config.
 *   testWordPressConnection(fd) — senior-only. Live ping to the title's WP
 *                              base + creds, no write.
 */

export type TitleConfigActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export type WpTestResult =
  | {
      ok: true;
      status: number;
      site_name: string | null;
      site_url: string | null;
      user_id: number | null;
    }
  | { ok: false; error: string; status?: number };

async function requireSeniorEditor(): Promise<TitleConfigActionResult | null> {
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
    return { ok: false, error: "Admin only" };
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

function trimOrNull(raw: FormDataEntryValue | null, max: number): string | null {
  if (raw === null) return null;
  const v = String(raw).trim().slice(0, max);
  return v.length === 0 ? null : v;
}

function parseFrame(raw: FormDataEntryValue | null): PrimaryFrame | null {
  const v = trimOrNull(raw, 80);
  if (!v) return null;
  return (PRIMARY_FRAMES as readonly string[]).includes(v)
    ? (v as PrimaryFrame)
    : null;
}

function parseGeoTier(raw: FormDataEntryValue | null): GeoTier | null {
  const v = trimOrNull(raw, 30);
  if (!v) return null;
  return GEO_TIERS.some((t) => t.value === v) ? (v as GeoTier) : null;
}

function parseWpStatus(
  raw: FormDataEntryValue | null,
): WpDefaultStatus | null {
  const v = trimOrNull(raw, 12);
  if (!v) return null;
  return WP_DEFAULT_STATUSES.some((s) => s.value === v)
    ? (v as WpDefaultStatus)
    : null;
}

function parseWeekday(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}

function parseDateOrNull(raw: FormDataEntryValue | null): string | null {
  const v = trimOrNull(raw, 10);
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function parseIntOrNull(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/* -------------------------------------------------------------------------- */
/*  createTitle — new publication silo                                        */
/* -------------------------------------------------------------------------- */

export async function createTitle(
  fd: FormData,
): Promise<TitleConfigActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const slug = trimOrNull(fd.get("slug"), 60);
  const name = trimOrNull(fd.get("name"), 120);
  const domain = trimOrNull(fd.get("domain"), 240);

  if (!slug) return { ok: false, error: "Slug is required" };
  if (!/^[a-z0-9][a-z0-9-]{1,58}$/.test(slug)) {
    return {
      ok: false,
      error: "Slug must be lowercase letters / digits / hyphens.",
    };
  }
  if (!name) return { ok: false, error: "Display name is required" };

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("titles")
    .insert({
      slug,
      name,
      domain,
      is_active: false, // Defaults inactive until configured.
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/system/titles");
  return { ok: true, id: data.id };
}

/* -------------------------------------------------------------------------- */
/*  updateTitleConfig — the big editor write                                  */
/* -------------------------------------------------------------------------- */

export async function updateTitleConfig(
  fd: FormData,
): Promise<TitleConfigActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const id = trimOrNull(fd.get("id"), 40);
  if (!id) return { ok: false, error: "Missing title id" };

  const name = trimOrNull(fd.get("name"), 120);
  const domain = trimOrNull(fd.get("domain"), 240);
  const tagline = trimOrNull(fd.get("tagline"), 240);
  const primaryColor = trimOrNull(fd.get("primary_color"), 20);
  const defaultFrame = parseFrame(fd.get("default_frame"));

  // WordPress
  const wpBaseUrl = trimOrNull(fd.get("wp_base_url"), 600);
  const wpUsername = trimOrNull(fd.get("wp_username"), 240);
  const wpAppPasswordRaw = trimOrNull(fd.get("wp_app_password"), 240);
  const wpAppPasswordClear = fd.get("wp_app_password_clear") === "1";
  const wpDefaultStatus = parseWpStatus(fd.get("wp_default_status"));
  const wpDefaultCategoryId = parseIntOrNull(fd.get("wp_default_category_id"));

  // Editorial
  const defaultSectors = parseListField(String(fd.get("default_sectors") ?? ""));
  const siloOptions = parseListField(String(fd.get("silo_options") ?? ""));
  const defaultGeoTier = parseGeoTier(fd.get("default_geo_tier"));
  const slugPrefix = trimOrNull(fd.get("slug_prefix"), 40);

  // Operational
  const isActive = fd.get("is_active") === "1";
  const launchedAt = parseDateOrNull(fd.get("launched_at"));
  const weeklyIssueDay = parseWeekday(fd.get("weekly_issue_day"));

  // Free-form
  const configRaw = String(fd.get("config_json") ?? "").trim();
  let configJson: Record<string, unknown> | null = null;
  if (configRaw) {
    try {
      const parsed = JSON.parse(configRaw);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return { ok: false, error: "Config JSON must be a plain object." };
      }
      configJson = parsed as Record<string, unknown>;
    } catch {
      return { ok: false, error: "Config JSON is not valid JSON." };
    }
  }

  // Field-level validation.
  if (!name) return { ok: false, error: "Display name is required" };
  if (primaryColor && !isValidHexColor(primaryColor)) {
    return { ok: false, error: "Primary colour must be a hex like #1A2B3C." };
  }
  if (wpBaseUrl && !isValidHttpsUrl(wpBaseUrl)) {
    return { ok: false, error: "WP base URL must be http/https." };
  }

  const uid = await currentUserId();
  const admin = createServiceClient();

  const update: Record<string, unknown> = {
    name,
    domain,
    tagline,
    primary_color: primaryColor,
    default_frame: defaultFrame,
    wp_base_url: wpBaseUrl,
    wp_username: wpUsername,
    wp_default_status: wpDefaultStatus,
    wp_default_category_id: wpDefaultCategoryId,
    default_sectors: defaultSectors,
    silo_options: siloOptions,
    default_geo_tier: defaultGeoTier,
    slug_prefix: slugPrefix,
    is_active: isActive,
    launched_at: launchedAt,
    weekly_issue_day: weeklyIssueDay,
    config_updated_at: new Date().toISOString(),
    config_updated_by: uid,
  };
  if (configJson !== null) update.config = configJson;

  // Only touch the app-password if the user typed a new one OR explicitly
  // cleared it. Otherwise leave the stored secret alone.
  if (wpAppPasswordClear) {
    update.wp_app_password = null;
  } else if (wpAppPasswordRaw) {
    update.wp_app_password = wpAppPasswordRaw;
  }

  const { error } = await admin.from("titles").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/system/titles");
  revalidatePath(`/system/titles/${id}`);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  setTitleActive — phase-2 toggle                                           */
/* -------------------------------------------------------------------------- */

export async function setTitleActive(
  fd: FormData,
): Promise<TitleConfigActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const id = trimOrNull(fd.get("id"), 40);
  if (!id) return { ok: false, error: "Missing title id" };
  const active = fd.get("active") === "1";

  const uid = await currentUserId();
  const admin = createServiceClient();
  const { error } = await admin
    .from("titles")
    .update({
      is_active: active,
      config_updated_at: new Date().toISOString(),
      config_updated_by: uid,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/system/titles");
  revalidatePath(`/system/titles/${id}`);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  testWordPressConnection — live ping                                       */
/* -------------------------------------------------------------------------- */

export async function testWordPressConnection(
  fd: FormData,
): Promise<WpTestResult> {
  const gate = await requireSeniorEditor();
  if (gate && !gate.ok) return { ok: false, error: gate.error };

  const id = trimOrNull(fd.get("id"), 40);
  if (!id) return { ok: false, error: "Missing title id" };

  const admin = createServiceClient();
  const { data: row } = await admin
    .from("titles")
    .select("wp_base_url, wp_username, wp_app_password")
    .eq("id", id)
    .maybeSingle<{
      wp_base_url: string | null;
      wp_username: string | null;
      wp_app_password: string | null;
    }>();
  if (!row) return { ok: false, error: "Title not found." };

  const base = row.wp_base_url;
  const user = row.wp_username;
  const pass = row.wp_app_password;
  if (!base || !user || !pass) {
    return {
      ok: false,
      error: "WordPress credentials incomplete — set base URL, user, and app password.",
    };
  }

  // /wp-json/ returns site discovery doc.
  const discoveryUrl = `${base.replace(/\/+$/, "")}/wp-json/`;
  let discoveryRes: Response;
  try {
    discoveryRes = await fetch(discoveryUrl, {
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
      },
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: `Network: ${(e as Error).message}` };
  }
  if (!discoveryRes.ok) {
    return {
      ok: false,
      status: discoveryRes.status,
      error: `Discovery failed: ${discoveryRes.status} ${discoveryRes.statusText}`,
    };
  }
  const disc = (await discoveryRes.json().catch(() => null)) as
    | { name?: string; url?: string }
    | null;

  // /wp-json/wp/v2/users/me verifies the credentials are accepted.
  const meUrl = `${base.replace(/\/+$/, "")}/wp-json/wp/v2/users/me`;
  let meRes: Response;
  try {
    meRes = await fetch(meUrl, {
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
      },
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: `Network (users/me): ${(e as Error).message}` };
  }
  if (!meRes.ok) {
    return {
      ok: false,
      status: meRes.status,
      error: `Credentials rejected: ${meRes.status} ${meRes.statusText}`,
    };
  }
  const meJson = (await meRes.json().catch(() => null)) as
    | { id?: number }
    | null;

  return {
    ok: true,
    status: meRes.status,
    site_name: disc?.name ?? null,
    site_url: disc?.url ?? null,
    user_id: meJson?.id ?? null,
  };
}
