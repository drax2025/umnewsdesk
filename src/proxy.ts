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
     */
    "/((?!_next/static|_next/image|favicon.ico|api/ingest|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
