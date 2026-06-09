/**
 * Constant-time bearer-token check for ingest routes.
 *
 * The token is shared with n8n (or any other ingestion runner) via env.
 * Returns { ok: true } when accepted, otherwise a NextResponse-ready
 * { ok: false, status, body } payload.
 */
export type AuthFailure = {
  ok: false;
  status: number;
  body: { error: string };
};
export type AuthSuccess = { ok: true };

export function checkIngestAuth(req: Request): AuthSuccess | AuthFailure {
  const token = process.env.INGEST_TOKEN;
  if (!token) {
    return {
      ok: false,
      status: 503,
      body: { error: "Ingest endpoint not configured (INGEST_TOKEN missing)" },
    };
  }
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return {
      ok: false,
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
    };
  }
  if (!timingSafeEqual(m[1], token)) {
    return { ok: false, status: 401, body: { error: "Invalid token" } };
  }
  return { ok: true };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
