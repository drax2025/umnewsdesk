import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crmConfigured, crmCreate, crmEnsure, crmResolve, crmWritesEnabled, type CrmOrg } from "./client";

/**
 * Who sent this release, according to the CRM.
 *
 * Resolution order is cache → CRM → press_agencies. The cache is what keeps
 * ingest independent of the CRM being up, and it caches misses as well as hits:
 * most sender domains are not in the CRM, and without a negative entry every
 * newsletter would cost a round trip on every poll.
 *
 * press_agencies is not being replaced. It carries source_id — the link into
 * discovery_sources — and trust_tier, neither of which the CRM knows about.
 */

const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000;

export type ResolvedAgency = {
  name: string | null;
  crmOrgId: string | null;
  lifecycle: string | null;
  isPrAgency: boolean;
  origin: "cache" | "crm" | "press_agencies" | "unknown";
};

/** Bare host, lowercase, no www — the same shape the CRM stores. */
export function normaliseSenderDomain(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  const host = (v.includes("@") ? v.split("@").pop()! : v)
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#]/)[0]!
    .replace(/^www\./, "")
    .split(":")[0]!
    .replace(/[>)"'\s.,;]+$/, "");
  return host.includes(".") && !/\s/.test(host) ? host : null;
}

type CacheRow = {
  domain: string;
  crm_org_id: string | null;
  name: string | null;
  lifecycle: string | null;
  is_pr_agency: boolean;
  synced_at: string;
};

function fresh(row: CacheRow): boolean {
  const age = Date.now() - new Date(row.synced_at).getTime();
  return age < (row.crm_org_id ? HIT_TTL_MS : MISS_TTL_MS);
}

async function writeCache(
  db: SupabaseClient,
  domain: string,
  org: CrmOrg | null,
  matchedBy: string | null,
): Promise<void> {
  const { error } = await db.from("crm_agency_cache").upsert(
    {
      domain,
      crm_org_id: org?.id ?? null,
      name: org?.name ?? null,
      lifecycle: org?.lifecycle ?? null,
      is_pr_agency: org?.isPrAgency ?? false,
      matched_by: matchedBy,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "domain" },
  );
  if (error) console.error("crm_agency_cache upsert failed:", error.message);
}

/**
 * The CRM's answer for one sender, falling back to press_agencies.
 *
 * `senderName` is only used to match an organisation that has no domain on
 * record — 271 of the 309 PR agencies are in that state — so it is worth
 * passing even though the domain usually decides it.
 */
export async function resolveAgency(
  db: SupabaseClient,
  rawDomain: string | null,
  senderName: string | null = null,
): Promise<ResolvedAgency> {
  const domain = normaliseSenderDomain(rawDomain);
  if (!domain) return { name: null, crmOrgId: null, lifecycle: null, isPrAgency: false, origin: "unknown" };

  if (crmConfigured()) {
    const { data: cached } = await db
      .from("crm_agency_cache")
      .select("domain, crm_org_id, name, lifecycle, is_pr_agency, synced_at")
      .eq("domain", domain)
      .maybeSingle<CacheRow>();

    if (cached && fresh(cached)) {
      if (cached.crm_org_id) {
        return {
          name: cached.name,
          crmOrgId: cached.crm_org_id,
          lifecycle: cached.lifecycle,
          isPrAgency: cached.is_pr_agency,
          origin: "cache",
        };
      }
      // A fresh cached miss. Fall through to press_agencies rather than
      // calling the CRM again for an answer we already have.
    } else {
      const live = await crmResolve(domain, senderName);
      if (live?.ok) {
        await writeCache(db, domain, live.org, live.matchedBy);
        if (live.org) {
          return {
            name: live.org.name,
            crmOrgId: live.org.id,
            lifecycle: live.org.lifecycle,
            isPrAgency: live.org.isPrAgency,
            origin: "crm",
          };
        }
      } else if (cached?.crm_org_id) {
        // CRM unreachable and the cached answer is stale. Stale beats nothing:
        // an agency does not stop being an agency because a box is rebooting.
        return {
          name: cached.name,
          crmOrgId: cached.crm_org_id,
          lifecycle: cached.lifecycle,
          isPrAgency: cached.is_pr_agency,
          origin: "cache",
        };
      }
    }
  }

  const { data: agency } = await db
    .from("press_agencies")
    .select("name")
    .contains("email_domains", [domain])
    .maybeSingle<{ name: string }>();

  return agency
    ? { name: agency.name, crmOrgId: null, lifecycle: null, isPrAgency: true, origin: "press_agencies" }
    : { name: null, crmOrgId: null, lifecycle: null, isPrAgency: false, origin: "unknown" };
}

/**
 * Every domain the desk currently considers a PR agency, without touching the
 * network: the press_agencies registry plus whatever the CRM has already told
 * us. Triage uses this to decide what is a release, so it wants to be cheap and
 * it wants to answer for the whole batch at once.
 */
export async function knownAgencyDomains(db: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>();

  const { data: agencies } = await db.from("press_agencies").select("email_domains");
  for (const a of agencies ?? []) {
    for (const d of (a.email_domains as string[] | null) ?? []) {
      const clean = normaliseSenderDomain(d);
      if (clean) out.add(clean);
    }
  }

  const { data: cached } = await db
    .from("crm_agency_cache")
    .select("domain")
    .eq("is_pr_agency", true)
    .returns<{ domain: string }[]>();
  for (const c of cached ?? []) out.add(c.domain);

  return out;
}

/**
 * Fill the cache for domains triage has not seen before, so the batch it is
 * about to classify is judged against the CRM rather than against whatever
 * happened to be cached last time. One call per new domain, once ever — the
 * miss is cached too.
 */
export async function warmAgencyDomains(
  db: SupabaseClient,
  domains: Iterable<string>,
  known: Set<string>,
): Promise<Set<string>> {
  if (!crmConfigured()) return known;
  const seen = new Set<string>();
  for (const raw of domains) {
    const domain = normaliseSenderDomain(raw);
    if (!domain || known.has(domain) || seen.has(domain)) continue;
    seen.add(domain);
    const r = await resolveAgency(db, domain);
    if (r.isPrAgency) known.add(domain);
  }
  return known;
}

export type EnsureOutcome = {
  action: string;
  reason: string | null;
  changes: string[];
  crmOrgId: string | null;
  dryRun: boolean;
};

/**
 * Report an inbound release to the CRM: create the agency if it is new,
 * promote it to client if it was a lead or a prospect.
 *
 * Called only when triage has classified the mail as a press release — every
 * pitch and newsletter would otherwise be dragged into the CRM as a client.
 *
 * Never throws. A CRM that is down must not fail an ingest, and the log row
 * written here is what makes a missed write findable afterwards.
 */
export async function ensureCrmAgency(
  db: SupabaseClient,
  input: { domain: string | null; name: string | null; candidateId?: string | null },
): Promise<EnsureOutcome | null> {
  const domain = normaliseSenderDomain(input.domain);
  if (!domain || !crmConfigured()) return null;

  const dryRun = !crmWritesEnabled();
  const result = await crmEnsure(domain, input.name, dryRun);

  if (!result?.ok) {
    await db.from("crm_sync_log").insert({
      domain,
      sender_name: input.name,
      candidate_id: input.candidateId ?? null,
      action: "error",
      reason: "the CRM did not answer",
      dry_run: dryRun,
    });
    return null;
  }

  await db.from("crm_sync_log").insert({
    domain,
    sender_name: input.name,
    candidate_id: input.candidateId ?? null,
    action: result.action,
    reason: result.reason ?? null,
    changes: result.changes ?? [],
    crm_org_id: result.org?.id && result.org.id !== "(new)" ? result.org.id : null,
    dry_run: dryRun,
  });

  if (result.action === "needs_review") {
    // A domain somebody has already ruled out is not asked about again.
    // Ninety of the first ninety-three queue entries were in-house press
    // offices that mail us every week; without this the same list comes back
    // indefinitely. See migration 0050.
    const { data: ignored } = await db
      .from("crm_ignored_domains")
      .select("domain")
      .eq("domain", domain)
      .maybeSingle<{ domain: string }>();
    if (ignored) return { action: result.action, reason: result.reason ?? null, changes: [], crmOrgId: null, dryRun };

    // Unique on open rows per domain, so the same agency mailing twice before
    // anyone looks does not produce two identical things to work through.
    const { error } = await db.from("crm_match_queue").insert({
      domain,
      sender_name: input.name,
      candidate_id: input.candidateId ?? null,
      reason: result.reason ?? "the CRM could not decide",
      candidates: (result.ambiguous ?? []).concat(result.org ? [result.org] : []),
    });
    if (error && error.code !== "23505") console.error("crm_match_queue insert failed:", error.message);
  }

  if (result.org && result.org.id !== "(new)") {
    await writeCache(db, domain, result.org, result.action === "created" ? "created" : null);
  }

  return {
    action: result.action,
    reason: result.reason ?? null,
    changes: result.changes ?? [],
    crmOrgId: result.org?.id ?? null,
    dryRun,
  };
}

/**
 * Create a record in the CRM because a person at the desk said what this
 * sender is.
 *
 * The automatic path refuses anything that does not read as an agency, which
 * is right when a machine is guessing and wrong once somebody has looked. Two
 * things come through here: an agency the heuristics missed, and a business
 * that sends its own PR — not a supplier at all, but a company worth a sales
 * call, so it goes in as a prospect with no relationship tag.
 */
export async function createCrmOrganisation(
  db: SupabaseClient,
  input: {
    domain: string;
    name: string | null;
    lifecycle: "prospect" | "client";
    asPrAgency: boolean;
    note?: string | null;
    candidateId?: string | null;
    /** True when a person typed the name, rather than it being inferred. */
    nameIsExplicit?: boolean;
    /** The person who sent the release, added to the record as a contact. */
    contactEmail?: string | null;
    contactName?: string | null;
  },
): Promise<EnsureOutcome | null> {
  const domain = normaliseSenderDomain(input.domain);
  if (!domain || !crmConfigured()) return null;

  const result = await crmCreate(
    domain, input.name, input.lifecycle, input.asPrAgency, input.note ?? null,
    input.nameIsExplicit === true,
    { email: input.contactEmail ?? null, name: input.contactName ?? null },
  );
  if (!result?.ok) return null;

  await db.from("crm_sync_log").insert({
    domain,
    sender_name: input.name,
    candidate_id: input.candidateId ?? null,
    action: result.action,
    reason: result.reason ?? null,
    changes: result.changes ?? [],
    crm_org_id: result.org?.id ?? null,
    dry_run: false,
  });

  if (result.org) await writeCache(db, domain, result.org, "created");

  return {
    action: result.action,
    reason: result.reason ?? null,
    changes: result.changes ?? [],
    crmOrgId: result.org?.id ?? null,
    dryRun: false,
  };
}

/**
 * What to put in the queue's name box before anyone edits it.
 *
 * The authoritative version of this rule lives in the CRM
 * (src/lib/desk/matching.ts) and still applies to anything created without an
 * explicit name. This is the desk's copy, and it exists only so the box can be
 * filled in before the request is made — showing "Becky Orlinski" and then
 * quietly saving something else would be worse than either.
 *
 * Kept deliberately small: the CRM decides, this only suggests.
 */
const ORG_WORDS =
  /\b(pr|prs|comms|communications|media|marketing|partnership|group|agency|agencies|associates|consultants?|consulting|creative|studio|digital|publicity|relations|press|newsroom|news|council|university|college|limited|ltd|plc|llp|llc|inc|company|team|office)\b/;

/** Words that describe a mailbox rather than a company — "Press Office". */
const GENERIC =
  /^(the|press|media|news|newsroom|comms|communications|marketing|pr|relations|team|office|desk|department|dept|enquiries|enquiry|info|contact|group)$/i;

const isGenericMailbox = (name: string) => {
  const words = name.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => GENERIC.test(w));
};

export function suggestedOrgName(domain: string, senderName: string | null): string {
  const n = (senderName ?? "").trim();
  if (!n) return domain;
  // "Claire at GiftRound" names the company after the person. Take the company.
  const at = /^.+?\s+(?:at|from|@)\s+(.+)$/i.exec(n);
  if (at?.[1]?.trim() && !isGenericMailbox(at[1].trim())) return at[1].trim();
  if (isGenericMailbox(n)) return domain;
  if (ORG_WORDS.test(n.toLowerCase())) return n;
  const bare = n.replace(/\([^)]*\)/g, " ").replace(/,.*$/, " ").trim();
  const words = bare.split(/\s+/).filter(Boolean);
  const isNameWord = (w: string) =>
    /^[A-Z]\.?$/.test(w) || /^[A-Z][a-z’\'-]+(?:[’\'-]?[A-Z][a-z’\'-]+)*\.?$/.test(w);
  if (words.length > 0 && words.length <= 3 && words.every(isNameWord)) return domain;
  return n;
}
