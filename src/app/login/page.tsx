import { LoginForm } from "./login-form";
import { getLoginWallpaper } from "@/lib/branding";

export const metadata = {
  title: "Sign in — Union Media",
};

type Search = { reset?: string; reset_error?: string };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const resetSuccess = sp.reset === "1";
  const resetError = sp.reset_error;
  const wallpaper = await getLoginWallpaper();
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-6">
      {/* Custom wallpaper (if set) + dark scrim for card legibility */}
      {wallpaper.url ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${JSON.stringify(wallpaper.url)})` }}
          />
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 bg-black"
            style={{ opacity: wallpaper.overlay }}
          />
        </>
      ) : null}

      {/* Subtle grid overlay — sits above the wallpaper but stays faint */}
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
        {/* Wordmark */}
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
          Sign in to your account
        </p>
        <p className="mb-5 text-[12px] text-fg-2">
          Internal staff access only.
        </p>

        {resetSuccess ? (
          <div className="mb-4 rounded-md border border-success/35 bg-success/10 px-3 py-2 text-[11.5px] leading-[1.5] text-success">
            Password updated. Sign in with your new password to continue.
          </div>
        ) : null}
        {resetError ? (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11.5px] leading-[1.5] text-destructive">
            {resetError === "missing_code"
              ? "That recovery link was malformed. Request a fresh one below."
              : resetError === "expired"
                ? "Recovery link expired or already used. Request a fresh one below."
                : "We couldn't sign you in via that recovery link. Request a fresh one below."}
          </div>
        ) : null}

        <LoginForm />

        <div className="mt-4 text-center text-[11.5px]">
          <a href="/login/forgot" className="text-primary hover:underline">
            Forgot your password?
          </a>
        </div>

        <div className="mt-6 border-t border-border pt-4 text-center text-[11.5px] text-fg-2">
          Having trouble?{" "}
          <a href="mailto:editorial@unionmedia.news" className="text-primary hover:underline">
            Contact IT support
          </a>
        </div>
      </div>

      <p className="relative z-10 mt-6 text-[11px] text-um-muted">
        Union Media Group · Internal systems · v0.1.0
      </p>
    </div>
  );
}
