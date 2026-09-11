-- ═══════════════════════════════════════════════════════════
-- "Not an agency" has to mean it, permanently.
--
-- crm_match_queue is unique on open rows per domain, so dismissing a
-- sender clears the row and nothing more: the next release from the
-- same domain queues it again. Ninety of the first ninety-three
-- entries are in-house press offices — parliament.scot, gov.scot,
-- scottishwater.co.uk, four universities — none of which will ever be
-- a PR agency, and all of which mail us regularly. Without this the
-- desk would dismiss the same eighty domains every few weeks forever.
--
-- A domain listed here is never queued again. It is not a block on
-- ingest: the release is still read, still attributed, still offered
-- to the desk. It only stops us asking a question that has already
-- been answered.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.crm_ignored_domains (
  domain     text primary key,           -- bare host, lowercase, no www
  reason     text,                       -- why, for whoever wonders later
  ignored_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.crm_ignored_domains is
  'Senders a person has ruled out as PR agencies. Never queued for review again; ingest is unaffected.';

alter table public.crm_ignored_domains enable row level security;

drop policy if exists "crm_ignored_domains_select_auth" on public.crm_ignored_domains;
create policy "crm_ignored_domains_select_auth"
  on public.crm_ignored_domains for select to authenticated using (true);
