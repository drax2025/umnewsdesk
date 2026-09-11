import { NextResponse } from "next/server";
import { APP_VERSION, BUILT_AT, SHORT_SHA } from "@/lib/version";

/**
 * GET /api/version — what is actually deployed.
 *
 * Unauthenticated on purpose: the point is to answer "did that deploy land"
 * without a session, which is exactly when you need to know. It returns the
 * version, the short commit and the build time and nothing else.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    version: APP_VERSION,
    commit: SHORT_SHA || null,
    builtAt: BUILT_AT || null,
  });
}
