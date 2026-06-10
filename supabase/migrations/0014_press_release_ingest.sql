-- Press-release email ingest (see docs/press-release-ingest-spec.md).
--
-- Three parts, all idempotent:
--   1. press_agencies registry — known PR senders mapped to discovery_sources
--   2. candidate extensions — email-specific fields (message_id, embargo, etc.)
--   3. message_id unique index — gives idempotent re-delivery for free

create table if not exists public.press_agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email_domains text[] not null,             -- e.g. ['edelman.co.uk', 'edelman.com']
  source_id uuid references public.discovery_sources(id) on delete set null,
  trust_tier smallint not null default 2,    -- 1=known good, 2=default, 3=watch
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per (agency, domain) so a domain → agency lookup is a plain index hit.
create index if not exists press_agencies_domains_idx
  on public.press_agencies using gin (email_domains);

create index if not exists press_agencies_trust_idx
  on public.press_agencies(trust_tier);

alter table public.candidates
  add column if not exists message_id         text,
  add column if not exists embargo_until      timestamptz,
  add column if not exists embargo_confidence text,         -- 'high' | 'med' | 'low' | 'none'
  add column if not exists pr_contact         jsonb,        -- {name, email, phone} — internal only
  add column if not exists attachment_urls    text[];

-- Unique on message_id when present. Postmark redeliveries / multi-address
-- forwards land on the same Message-ID, so this gives us at-least-once
-- safety with no application-level dedup logic.
create unique index if not exists candidates_message_id_idx
  on public.candidates(message_id) where message_id is not null;

-- Quick filter for the embargo release cron.
create index if not exists candidates_embargo_idx
  on public.candidates(embargo_until)
  where embargo_until is not null;

-- Fallback discovery_source for emails from unknown senders.
-- Known agencies point at their own source_id; everything else lands here
-- so the inbox + source filters keep working without a NULL source_id branch.
insert into public.discovery_sources
  (code, name, feed_url, crawl_method, layer, status, exclusivity_window_hours)
values
  ('PRESS_MAILBOX', 'Press mailbox (unattributed)', 'mailto:press@unionmedia', 'email', 'l3', 'active', 24)
on conflict (code) do nothing;
