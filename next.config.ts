import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

/**
 * Build stamp.
 *
 * Until now the only way to tell which code was live was to poke the app and
 * infer it from behaviour — which is how an afternoon went on wondering
 * whether a deploy had taken. The version comes from package.json so there is
 * one place to change it; the commit and build time come from Vercel, and are
 * empty on a local build, which is itself the useful signal.
 */
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_BUILT_AT: new Date().toISOString(),
  },
};

export default nextConfig;
