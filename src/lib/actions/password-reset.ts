"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Public, unauthenticated actions for the self-service password reset
 * flow. The admin-driven variant lives in src/lib/actions/team.ts behind
 * a senior-editor gate.
 *
 * Flow:
 *   1. user posts /login/forgot → requestPasswordReset() emails them a
 *      Supabase recovery link
 *   2. recovery link → /auth/callback?code=… (handled by the route
 *      handler, exchanges the code for a session)
 *   3. callback redirects to /auth/reset, which posts confirmNewPassword()
 *      to set the new password on the now-authenticated session
 *
 * confirmNewPassword() requires an active recovery session; if none is
 * present it returns an error rather than silently no-op'ing — that
 * surfaces "the link expired, request a new one".
 */

export type PasswordResetActionResult =
  | { ok: true }
  | { ok: false; error: string };

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://desk.unionmedia.news"
  );
}

/**
 * Anyone can call this — submitting any email is fine. We deliberately
 * don't tell the caller whether the email is registered, because that
 * turns this form into an account-enumeration oracle. The success
 * banner says "if that address has an account, check your inbox".
 */
export async function requestPasswordReset(
  formData: FormData,
): Promise<PasswordResetActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteOrigin()}/auth/callback?next=/auth/reset`,
  });

  // resetPasswordForEmail returns errors only for hard failures (rate
  // limit, malformed payload). A non-existent email is NOT an error —
  // Supabase silently no-ops to avoid enumeration. So we treat "no
  // error" as "we did our part".
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Final step of the recovery flow. Caller must have an active session
 * (Supabase set one when /auth/callback exchanged the recovery code).
 *
 * On success we redirect to /login with a flag so the login form can
 * tell the user the change went through. We don't auto-sign them in —
 * the recovery session is a one-shot, and a clean re-login proves the
 * new password works.
 */
export async function confirmNewPassword(
  _prev: { error: string | null; ok?: boolean },
  formData: FormData,
): Promise<{ error: string | null; ok?: boolean }> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 10) {
    return { error: "Password must be at least 10 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "Recovery link is no longer valid. Request a fresh reset email from the sign-in page.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  // Sign out the recovery session so they're forced to type the new
  // password — confirms muscle memory before they leave the keyboard.
  await supabase.auth.signOut();
  redirect("/login?reset=1");
}
