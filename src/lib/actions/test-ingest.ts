"use server";

import { headers } from "next/headers";

/**
 * Server-side proxy to /api/ingest/*. The browser console posts here so
 * the bearer token never leaves the server. Otherwise behaves exactly
 * like the live wire path n8n will use — fetches the actual route via
 * HTTP so dedup, validation, and side effects all run.
 */

export type ProxyResult = {
  status: number;
  ok: boolean;
  body: unknown;
  url: string;
  curl: string;
  payload: unknown;
};

async function resolveBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  // Fall back to the request host so test-ingest works in deployment
  // environments where the env var hasn't been set.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

function buildCurl(url: string, payload: unknown): string {
  const body = JSON.stringify(payload, null, 2);
  return [
    `curl -X POST '${url}' \\`,
    `  -H 'Authorization: Bearer $INGEST_TOKEN' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${body.replace(/'/g, "'\\''")}'`,
  ].join("\n");
}

async function proxy(path: string, payload: unknown): Promise<ProxyResult> {
  const base = await resolveBaseUrl();
  const url = `${base}${path}`;
  const token = process.env.INGEST_TOKEN ?? "";

  const fetchRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  let parsed: unknown = null;
  const text = await fetchRes.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  return {
    status: fetchRes.status,
    ok: fetchRes.ok,
    body: parsed,
    url,
    curl: buildCurl(url, payload),
    payload,
  };
}

export async function callOpenSweep(payload: {
  slot: "am" | "pm";
  trigger?: "scheduled" | "manual" | "webhook";
  started_at?: string;
}): Promise<ProxyResult> {
  return proxy("/api/ingest/sweep", payload);
}

export async function callIngestItem(payload: unknown): Promise<ProxyResult> {
  return proxy("/api/ingest/item", payload);
}

export async function callCompleteSweep(
  sweepId: string,
  payload: unknown,
): Promise<ProxyResult> {
  return proxy(`/api/ingest/sweep/${encodeURIComponent(sweepId)}/complete`, payload);
}

export async function callIngestAlert(payload: unknown): Promise<ProxyResult> {
  return proxy("/api/ingest/alert", payload);
}
