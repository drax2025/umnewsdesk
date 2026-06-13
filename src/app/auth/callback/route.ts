import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase auth callback — used by password recovery (and any future
 * email-link flow). The recovery email Supabase sends points here with
 * `?code=…&next=/auth/reset`. We exchange the code for a session cookie
 * via supabase-ssr, then forward to whatever ?next= asked for, falling
 * back to the homepage.
 *
 * Anything that goes wrong (missing code, exchange fails, expired link)
 * gets bounced back to /login with an explanatory query so the form
 * surfaces "request a new link".
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?reset_error=missing_code", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(
        `/login?reset_error=${encodeURIComponent(error.message)}`,
        url.origin,
      ),
    );
  }

  // Constrain `next` to same-origin paths so an attacker can't redirect
  // an authenticated session off-site.
  const safeNext = next.startsWith("/") ? next : "/";
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
