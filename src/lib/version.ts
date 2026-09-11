/**
 * What is running.
 *
 * Injected at build time by next.config.ts. On a local `next dev` the commit
 * is empty and `where` reads "local", which is the honest answer rather than a
 * stale sha copied from the last deploy.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
export const COMMIT_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "";
export const BUILT_AT = process.env.NEXT_PUBLIC_BUILT_AT ?? "";

export const SHORT_SHA = COMMIT_SHA ? COMMIT_SHA.slice(0, 7) : "";

/** "v0.9.0 · 9feb88e" for the sidebar, or "v0.9.0 · local" in development. */
export function buildLabel(): string {
  return `v${APP_VERSION} · ${SHORT_SHA || "local"}`;
}
