import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths except:
     * - _next/static, _next/image, favicon, public assets
     * - /api/ingest/* (bearer-token auth, called by n8n with no cookie)
     * - /api/cron/*   (Vercel cron — CRON_SECRET via Authorization header)
     * - /api/version  (build stamp — the point is to answer "did that deploy
     *                  land" without a session, which is when you need it)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/ingest|api/cron|api/version|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
