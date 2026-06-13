"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Team management actions. Profiles are 1:1 with auth.users — created
 * automatically by the on_auth_user_created trigger when an invite is
 * accepted. So we use the service-role admin API to invite/delete users
 * and write through to profiles for role + display name.
 *
 * Every action gates on senior_editor first using the user-context
 * client so RLS proves the caller, then switches to the service-role
 * client for the mutation that needs to touch other people's rows.
 */

type Role = "senior_editor" | "editor" | "reviewer" | "viewer";
const ROLES: Role[] = ["senior_editor", "editor", "reviewer", "viewer"];

export type TeamActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

async function requireSeniorEditor(): Promise<TeamActionResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (me?.role !== "senior_editor") {
    return { ok: false, error: "Only senior editors can manage the team" };
  }
  return null;
}

function revalidateTeam() {
  revalidatePath("/team");
}

/* -------------------------------------------------------------------------- */
/*  INVITE                                                                    */
/* -------------------------------------------------------------------------- */

export async function inviteTeamMember(formData: FormData): Promise<TeamActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "viewer") as Role;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address" };
  }
  if (full_name.length < 2) {
    return { ok: false, error: "Full name must be at least 2 characters" };
  }
  if (!ROLES.includes(role)) {
    return { ok: false, error: "Invalid role" };
  }

  const admin = createServiceClient();

  // The handle_new_user trigger seeds profiles.full_name from
  // raw_user_meta_data.full_name when present, falling back to email.
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name },
  });
  if (inviteErr || !invited?.user) {
    return { ok: false, error: inviteErr?.message ?? "Failed to send invite" };
  }

  // Trigger has now inserted a profile row. Update the role (and full_name
  // explicitly, in case the trigger raced or the user already existed).
  const { error: updateErr } = await admin
    .from("profiles")
    .update({ role, full_name })
    .eq("id", invited.user.id);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidateTeam();
  return { ok: true, id: invited.user.id };
}

/* -------------------------------------------------------------------------- */
/*  UPDATE                                                                    */
/* -------------------------------------------------------------------------- */

export async function updateProfileRole(formData: FormData): Promise<TeamActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!id || !ROLES.includes(role)) return { ok: false, error: "Invalid input" };

  const admin = createServiceClient();
  const { error } = await admin.from("profiles").update({ role }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateTeam();
  return { ok: true, id };
}

export async function updateProfileName(formData: FormData): Promise<TeamActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const id = String(formData.get("id") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!id || full_name.length < 2) {
    return { ok: false, error: "Full name must be at least 2 characters" };
  }

  const admin = createServiceClient();
  const { error } = await admin.from("profiles").update({ full_name }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateTeam();
  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/*  PASSWORD RESET (admin-triggered)                                          */
/* -------------------------------------------------------------------------- */

/**
 * Senior-editor action: email a password-recovery link to one team
 * member. Used from the /team table when a user pings to say they're
 * locked out and you want to fix it without leaving the app.
 *
 * Behaviour:
 *   - looks the target's email up via the admin auth API (auth.users
 *     isn't reachable from the user-context client)
 *   - calls supabase.auth.resetPasswordForEmail() — Supabase ships the
 *     email itself using whatever SMTP / template the project is
 *     configured with
 *   - redirectTo points at /auth/callback, which exchanges the recovery
 *     code for a session and forwards on to /auth/reset where the user
 *     picks a new password
 */
export async function sendPasswordResetForUser(
  formData: FormData,
): Promise<TeamActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing user id" };

  const admin = createServiceClient();
  const { data: target, error: lookupErr } = await admin.auth.admin.getUserById(id);
  if (lookupErr || !target?.user?.email) {
    return {
      ok: false,
      error: lookupErr?.message ?? "Couldn't find that user's email",
    };
  }

  // resetPasswordForEmail is callable from the user-context client (no auth
  // required — that's the whole point). The redirect URL has to be on the
  // current origin or the email link will land somewhere harmless.
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://desk.unionmedia.news";

  const supabase = await createClient();
  const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
    target.user.email,
    { redirectTo: `${origin}/auth/callback?next=/auth/reset` },
  );
  if (resetErr) return { ok: false, error: resetErr.message };

  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/*  DELETE                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Deleting the auth user cascades to public.profiles via the FK
 * (`id uuid primary key references auth.users(id) on delete cascade`).
 * Don't allow deleting yourself — a senior editor demoting themselves
 * mid-action would otherwise lock the team page entirely.
 */
export async function deleteTeamMember(formData: FormData): Promise<TeamActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing id" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === id) {
    return { ok: false, error: "You can't remove your own account" };
  }

  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { ok: false, error: error.message };

  revalidateTeam();
  return { ok: true };
}
