# Press release ingest — design

> **Historical — not the running system.**
> This document describes the V2 editorial pipeline (stages F1–F8: commissioning,
> drafting, sub-editing, legal, pre-flight, WordPress publishing), which was
> retired on 2 September 2026. News Desk now does discovery and hands selected
> candidates to Newsroom V1, which owns everything downstream. Kept as a record
> of what was built and why. See `PROJECT_NOTES.md` and `README.md` for the
> system as it stands.

**Status:** draft · **Owner:** UM Newsroom engineering · **Last updated:** 2026-06-10

## Goal
Turn the daily flood of PR-agency emails into reliable, embargo-respecting `candidates` rows, with attribution that makes the triage scorecard's "credible source" factor meaningful and a paper trail that survives a libel audit.

## Architecture

```
Agency email ──► Inbound mail receiver ──► /api/ingest/email
                  (Postmark / SES / n8n IMAP)        │
                                                     ▼
                                        Normalizer + Embargo parser
                                                     │
                                       ┌─────────────┼──────────────┐
                                       ▼             ▼              ▼
                                 candidates    embargo_holds   attachments
                                 (held until lift)              (signed URLs)
```

## 1. Reception layer — pick one

| Option | Lift | Fit |
|---|---|---|
| **Postmark Inbound** (recommended) | Point MX of `press@yourdomain.com` → Postmark, set webhook to `/api/ingest/email`. Postmark parses MIME, hosts attachments, posts clean JSON. | Lowest engineering cost. ~$1.25 per 1k emails. |
| **AWS SES → S3 → Lambda** | More plumbing. Cheapest at scale. | Only if cost matters at high volume. |
| **n8n IMAP trigger** | Polls a Gmail/M365 mailbox, normalises, POSTs `/api/ingest/item`. | Consistent with the RSS pipeline you already run on n8n. Stateful (last-seen UID). |

**Recommendation:** Postmark for production. Fall back to n8n IMAP for the MVP if you want zero new vendors.

## 2. Per-message parsing pipeline

Each stage is independent and idempotent so a partial failure heals on retry.

1. **Receive** — POST to `/api/ingest/email` with `{from, to, subject, html, text, attachments[], headers, message_id}`. Verify HMAC on the webhook to stop spoof posts.
2. **Identify sender** — match `from` against `press_agencies` registry (see §4). Unknown sender → still ingest, flag `verification_state='unverified'`, route to triage's *Held — Source* lane.
3. **Choose body source** — prefer plain `text`; fall back to HTML stripped via a server-side sanitiser; if both are thin and there's a PDF attachment, extract its text (`pdf-parse` runs fine on Vercel Node runtime).
4. **Extract structured fields with Claude** — single `messages.create` call returning strict JSON: `{headline, standfirst, body, quotes[], company, embargo, contact, boilerplate_indices}`. Cached prompt template lives in the prompt library you just built (new `kind: "extract"`).
5. **Embargo gate** — see §5.
6. **Persist** as a `candidates` row via the existing `/api/ingest/item` path so dedup, source-registry FK, and surfaced-at logic all reuse the proven code.

## 3. Data model — additive only

```sql
-- 0014_press_release_ingest.sql

create table public.press_agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email_domains text[] not null,             -- ['edelman.co.uk', 'edelman.com']
  source_id uuid references public.discovery_sources(id),
  trust_tier smallint not null default 2,    -- 1=known good, 2=default, 3=watch
  created_at timestamptz not null default now()
);

alter table public.candidates
  add column if not exists message_id text,        -- RFC822 Message-ID for dedup
  add column if not exists embargo_until timestamptz,
  add column if not exists embargo_confidence text, -- 'high' | 'med' | 'low' | 'none'
  add column if not exists pr_contact jsonb,        -- {name, email, phone} — NEVER surfaced publicly
  add column if not exists attachment_urls text[];

create unique index if not exists candidates_message_id_idx
  on public.candidates(message_id) where message_id is not null;
```

The `message_id` unique index gives idempotent re-delivery for free.

## 4. Press-agency registry

Editor-managed list (extend `/discovery/sources` or add `/team/agencies`). Each agency row:

- Display name, email domain(s), default `source_id`, trust tier
- Maps to a `discovery_sources` row so the candidate's `source_id` lights up the existing inbox filters and the scorecard's press-release-quality factor
- New senders auto-create a stub agency row in `trust_tier=3` so unknowns surface for one-click confirmation

## 5. Embargo handling — the make-or-break feature

A leaked embargoed release is a relationship-ender with PR agencies. Default to caution.

1. **Regex pass** — six patterns cover ~70% (`EMBARGO(ED)? UNTIL...`, `Strictly embargoed...`, `FOR IMMEDIATE RELEASE` etc.). Confidence = `high` if matched + parsable timestamp.
2. **Claude pass** — only on regex misses. Returns `{embargoed: bool, until: iso, confidence}`. Cap at low/med because regex is more deterministic.
3. **If `embargo_until` in the future** → candidate created with `triage_state='held_source'` and `embargo_until` set. Hidden from the default ready queue.
4. **Release job** — Vercel Cron at minute-0 every 15 min runs `UPDATE candidates SET triage_state='ready' WHERE triage_state='held_source' AND embargo_until <= now()`.
5. **Operator override** — show embargo banner on the candidate row with the parsed time + confidence. One-click "release now" requires senior_editor role.

`FOR IMMEDIATE RELEASE` is treated as `embargo_until = NULL, confidence = 'high'`.

## 6. Dedup

- Primary: `message_id` unique index (catches re-sends to multiple addresses).
- Secondary: existing similarity dedup on headline+first paragraph (reuses what RSS already does — catches the same release going to RSS *and* mailbox).

## 7. Operator UI

Two small additions:

- **Inbox row** — small envelope icon on press-release candidates; embargo time as a chip ("⏱ 09:00 Tue") if held.
- **Agency admin** — `/team/agencies` page modelled on the team page. Senior editors confirm new agencies, set trust tier.

## 8. Attachments

Postmark hosts each attachment at a signed URL for 7 days. Persist URLs in `candidates.attachment_urls`. For longer-term retention, mirror to Supabase Storage via a background job (Phase 2).

## 9. MVP cut (one week)

1. Postmark inbound webhook → `/api/ingest/email` with HMAC verification
2. Plain-text body only (no PDF extraction yet)
3. Regex embargo parser; Claude pass deferred to Phase 2
4. Manual agency seed (insert ~20 known agencies via SQL); auto-create stays for Phase 2
5. Vercel Cron release job
6. Envelope icon + embargo chip in inbox

**Phase 2 (later):** PDF/Word extraction, Claude embargo fallback, `/team/agencies` UI, attachment mirroring, image extraction from MIME.

## 10. Implementation effort — n8n vs Postmark

Same end state, very different build paths. Days assume one engineer familiar with this codebase.

### Postmark route — **~5 days end-to-end**

| Task | Effort | Notes |
|---|---|---|
| Provision Postmark inbound server + verify domain | 0.5d | DNS access required. SPF/DKIM/MX records. |
| Configure inbound stream + webhook URL | 0.25d | Postmark UI. Set HMAC secret. |
| `/api/ingest/email` route (Next.js) | 1d | HMAC verify, idempotent on `message_id`, normalise into existing `/api/ingest/item` shape. Pure code in this repo. |
| Press-agencies migration + seed | 0.5d | SQL only. |
| Embargo regex parser + tests | 1d | Six patterns, timestamp parsing, BST/GMT handling. |
| Vercel Cron release job | 0.25d | One SQL statement on a schedule. |
| Inbox UI (icon + chip) | 0.5d | Existing table tweak. |
| Smoke test with real agency emails | 1d | Forward a week of mail to the new address. |

**Pros:** All logic lives in this repo and is type-checked, version-controlled, deployable with the rest of the app. HMAC + replay protection out of the box. Attachments hosted for you. Easiest to reason about and debug because the whole path is in TypeScript.

**Cons:** Adds a vendor (Postmark) and a recurring cost. Requires DNS access to the receiving domain.

### n8n route — **~3 days for a happy-path MVP, plus ongoing operational load**

| Task | Effort | Notes |
|---|---|---|
| Provision/identify dedicated mailbox (Gmail or M365) | 0.25d | Existing inbox can be reused but pollution risk. |
| n8n IMAP Trigger node + credential | 0.5d | Last-UID state lives in n8n. Backfill on restart is a known gotcha. |
| Email Parser node + Function node | 1d | Pull `from`, subject, text, html, message-id, attachments. Strip HTML inline because n8n's HTML node is awkward. |
| HTTP Request node → `/api/ingest/item` | 0.25d | Maps to existing `NormalizedItem` contract. |
| Embargo regex (in the Function node or a Code node) | 0.75d | Same regex, but written in n8n's runtime — harder to test. |
| Press-agencies migration + seed | 0.5d | Same SQL work. |
| Vercel Cron release job | 0.25d | Same. |
| Inbox UI | 0.5d | Same. |
| Operational hardening (retries, dedup on IMAP UID rollover, watchdog) | **2–3d (ongoing)** | This is where the time really goes. |

**Pros:** Reuses your existing n8n footprint and the existing `/api/ingest/item` endpoint. No new vendor. Visual workflow that non-engineers can inspect.

**Cons:**
- **State management is fragile.** IMAP UIDs reset when a mailbox is rebuilt, when accounts migrate from Gmail to M365, or after a server-side fix on the provider side. Each reset risks re-ingesting hundreds of emails or silently missing new ones.
- **Attachments are awful.** n8n's IMAP node delivers attachments as base64 in the JSON payload, which blows past payload limits on a release with three 5 MB PDFs. You'll end up writing a custom Code node that streams them to Supabase Storage — and at that point you've reinvented half of what Postmark gives you free.
- **No webhook auth.** The pipeline is push-from-n8n which is fine, but you lose Postmark's HMAC-on-delivery audit trail. You'll want to log every received email to a `mail_inbox_log` table to compensate.
- **Test loop is slow.** You can't unit-test an n8n workflow. Iteration means clicking through the canvas.
- **Operational ownership.** Someone has to babysit n8n: credential rotation, version upgrades, the workflow editor's quirks.

### Bottom line

| | Postmark | n8n |
|---|---|---|
| Time to working MVP | 5 days | 3 days |
| Time to **reliable** production | 5 days | 8–10 days (incl. attachment story + ops) |
| Ongoing maintenance | low | medium-high |
| Recurring cost | ~$10–20/mo at typical newsroom volume | $0 (already paying for n8n) |
| Where the logic lives | in this repo, typed, tested | in n8n canvas |
| Risk profile | vendor lock-in (low — easy to swap) | silent-failure mode on IMAP edge cases |

**Recommendation:** start on Postmark. The day-1 lift is nominally bigger but the path to **reliable** is the same week. n8n is the right choice only if Postmark is blocked for procurement reasons.

A hybrid is also reasonable: ship the Postmark webhook + `/api/ingest/email` route now, and keep n8n IMAP as a backup ingest path against a separate forwarding address. Both write through the same contract, so the rest of the app doesn't care which one delivered the message.

## Open questions

1. Is `press@uniomedia.co.uk` (or similar) a real address yet, or do we need to provision one?
2. Should embargoed releases be visible-but-locked to all roles, or invisible until lift to non-senior editors?
3. Any agency list you want pre-seeded?
