import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-form";

export const metadata = {
  title: "Set new password — Union Media",
};

export const dynamic = "force-dynamic";

/**
 * Final step of the password-recovery flow. The /auth/callback handler
 * has already exchanged the recovery code for a session by the time we
 * render, so we can check supabase.auth.getUser() to make sure we're
 * not serving this page to someone who landed here directly.
 *
 * If there's no session, bounce them back to /login with a flag — the
 * sign-in form surfaces "the recovery link expired".
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?reset_error=expired");
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-6">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(var(--um-border) 1px, transparent 1px), linear-gradient(90deg, var(--um-border) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 w-full max-w-[360px] rounded-[10px] border border-border bg-card p-8 pb-7">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[7px] bg-primary">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M4 3v7.5C4 13.1 6.24 15 9 15s5-1.9 5-4.5V3"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold tracking-[-0.02em] leading-[1.1]">
              Union Media
            </span>
            <span className="mt-0.5 block font-mono text-[10.5px] uppercase tracking-[0.04em] text-um-muted">
              Editorial Operations
            </span>
          </div>
        </div>

        <p className="mb-1 text-[16px] font-semibold tracking-[-0.02em]">
          Set a new password
        </p>
        <p className="mb-5 text-[12px] leading-[1.5] text-fg-2">
          Signed in as{" "}
          <span className="font-mono text-foreground">{user.email}</span>.
          After saving you&apos;ll be signed out so you can re-test the new
          password.
        </p>

        <ResetPasswordForm />
      </div>

      <p className="relative z-10 mt-6 text-[11px] text-um-muted">
        Union Media Group · Internal systems · v0.1.0
      </p>
    </div>
  );
}
