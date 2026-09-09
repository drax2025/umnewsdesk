# CRM integration

The desk reads PR agency records from the Azzurro CRM, and reports new agencies back to it
when they send us material.

The CRM is a **separate self-hosted Supabase** (`supabase.unionmediainc.com`, on our own VPS).
This app is on Supabase Cloud. There are no foreign keys and no joins between them — every
lookup crosses as HTTP, to a box that can be down.

## Shape

```
ingest ─► resolveAgency(domain, name) ─► crm_agency_cache ─► CRM ─► press_agencies
                                          (24h hits, 1h misses)      (fallback)

ingest ─► ensureCrmAgency(domain, name) ─► CRM /api/desk/agency ─► crm_sync_log
                                                                └─► crm_match_queue
```

- `src/lib/crm/client.ts` — signed HTTP to the CRM. Never throws; returns null and the caller falls back.
- `src/lib/crm/agency.ts` — resolution order, the cache, and the write path.
- `supabase/migrations/0049_crm_agency_link.sql` — `crm_agency_cache`, `crm_sync_log`, `crm_match_queue`.

`press_agencies` is **not** replaced. It carries `source_id` (the link into `discovery_sources`)
and `trust_tier`, which the CRM has no concept of, and it is what answers when the CRM cannot
be reached. The CRM answers the commercial question: is this a client, and what do we call them.

## Auth

A shared secret, `CRM_API_SECRET`, signing the raw request body with HMAC-SHA256. **No CRM
service-role key reaches this app** — a Vercel environment variable holding unrestricted access
to every table in the CRM was the alternative, and this is the narrow version of it.

## Where it is called

| Call site | What it does |
|---|---|
| `src/app/api/cron/triage-inbox/route.ts` | widens `isKnownAgency` from the 21 rows in `press_agencies` to the CRM's 309 organisations tagged 'PR Agency' |
| `src/lib/ingest/email-candidate.ts` | resolves the agency name for the candidate, then reports the sender to the CRM |

The write happens at **ingest**, not in triage, for two reasons: a forwarded release is
unwrapped by then, so the sender is the agency rather than whoever passed it on; and only mail
that actually became a candidate is a release. Mail from our own domains is skipped outright.

## Rules

Set out in full in the CRM repo's `docs/newsroom-integration.md`. In short:

- **Only PR agencies.** A council or a university sends releases too; the desk's rule is about
  agencies, and anything else goes to the review queue untouched.
- `lead` and `prospect` both promote to `client` when material arrives.
- A blank `domain` is filled on a name match; an existing one is never overwritten.
- Anything uncertain is queued, not written.

## Turning it on

1. Apply `0049_crm_agency_link.sql` in the Supabase SQL editor.
2. Set `DESK_API_SECRET` on the CRM (`/var/www/azzurro-crm/.env`) and deploy the CRM app.
3. Set `CRM_API_URL`, `CRM_API_SECRET` and `NEXT_PUBLIC_CRM_URL` here. Leave
   `CRM_WRITE_ENABLED` unset.
4. With writes off, every `ensure` call is a dry run: nothing changes in the CRM and the
   intended action is written to `crm_sync_log` with `dry_run = true`. Read that table.
5. Set `CRM_WRITE_ENABLED=true` when it reads right.

The review queue is on **Team → Press agencies**.
