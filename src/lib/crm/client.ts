import "server-only";
import { createHmac } from "node:crypto";

/**
 * Transport to the Azzurro CRM's desk API.
 *
 * The CRM is a separate self-hosted Supabase on our own VPS, reached over the
 * public internet from Vercel. It can be down, slow, or mid-deploy, and none of
 * that is allowed to stop a press release being ingested — so every function
 * here returns null rather than throwing, and the caller falls back.
 *
 * We hold a shared secret, not a service-role key: the CRM exposes one narrow
 * route and signs with HMAC-SHA256 over the raw body. See the CRM repo's
 * docs/newsroom-integration.md.
 */

const TIMEOUT_MS = 4_000;

export type CrmOrg = {
  id: string;
  name: string;
  domain: string | null;
  lifecycle: string;
  isPrAgency: boolean;
};

export type CrmResolve = {
  ok: true;
  domain: string | null;
  org: CrmOrg | null;
  matchedBy: "domain" | "name" | null;
  ambiguous: CrmOrg[];
};

export type CrmEnsureAction =
  | "ignored" | "none" | "promoted" | "created" | "created_untagged" | "needs_review"
  | "would_promote" | "would_create" | "linked";

export type CrmEnsure = {
  ok: true;
  action: CrmEnsureAction;
  reason?: string;
  changes: string[];
  org: CrmOrg | null;
  ambiguous: CrmOrg[];
};

/** A slug from the CRM's `relationships` table. */
export type CrmRelationship = "pr-agency" | "marketing-agency" | "link-builder" | "web-design";

export function crmConfigured(): boolean {
  return !!(process.env.CRM_API_URL && process.env.CRM_API_SECRET);
}

/** Writes are off until someone turns them on. The dry run comes first. */
export function crmWritesEnabled(): boolean {
  return process.env.CRM_WRITE_ENABLED === "true";
}

async function call<T>(body: Record<string, unknown>): Promise<T | null> {
  const url = process.env.CRM_API_URL;
  const secret = process.env.CRM_API_SECRET;
  if (!url || !secret) return null;

  const raw = JSON.stringify({ ...body, ts: Date.now() });
  const signature = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-desk-signature": signature },
      body: raw,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    // 207 is a partial success the CRM reports deliberately (created but not
    // tagged); it carries a usable body and must not be treated as a failure.
    if (!res.ok && res.status !== 207) {
      console.error(`CRM ${body.op} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
      return null;
    }
    return JSON.parse(text) as T;
  } catch (e) {
    console.error(`CRM ${body.op} unreachable:`, (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function crmResolve(domain: string | null, name: string | null): Promise<CrmResolve | null> {
  return call<CrmResolve>({ op: "resolve", domain, name });
}

/**
 * Create a record the desk has decided on. Unlike `ensure`, this is not the
 * machine's judgement — so it is not subject to the machine's refusals.
 */
export function crmCreate(
  domain: string,
  name: string | null,
  lifecycle: "prospect" | "client",
  relationship: CrmRelationship | null,
  note: string | null,
  nameIsExplicit: boolean,
  contact: { email: string | null; name: string | null },
): Promise<CrmEnsure | null> {
  return call<CrmEnsure>({
    op: "create", domain, name, lifecycle, relationship, note, nameIsExplicit,
    contactEmail: contact.email, contactName: contact.name,
  });
}

export function crmEnsure(
  domain: string | null,
  name: string | null,
  dryRun: boolean,
): Promise<CrmEnsure | null> {
  return call<CrmEnsure>({ op: "ensure", domain, name, dryRun });
}
