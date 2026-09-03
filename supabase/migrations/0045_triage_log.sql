-- ═══════════════════════════════════════════════════════════
-- News Desk now sorts the Zoho INBOX, so the record of what it decided
-- moves here with it.
--
-- Every decision is written, including the ones that moved nothing.
-- "Why is this still in my inbox" is the question people actually ask,
-- and a log of only the moves cannot answer it.
--
-- Not an enum: the categories will change as the rules are tuned, and a
-- migration per adjustment to an advisory label is not worth it.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.triage_log (
  id         bigint generated always as identity primary key,
  decided_at timestamptz not null default now(),
  uid        bigint,
  message_id text,
  from_email text,
  subject    text,
  category   text not null,
  moved_to   text,
  reason     text
);

create index if not exists triage_log_decided_at_idx on public.triage_log(decided_at desc);
create index if not exists triage_log_category_idx   on public.triage_log(category);

comment on table public.triage_log is
  'One row per message the inbox triage looked at. moved_to null means it was left in the inbox on purpose.';

alter table public.triage_log enable row level security;

-- Staff can read it; only the service role writes, which is what the cron uses.
drop policy if exists "triage_log_select_auth" on public.triage_log;
create policy "triage_log_select_auth"
  on public.triage_log for select
  to authenticated
  using (true);
