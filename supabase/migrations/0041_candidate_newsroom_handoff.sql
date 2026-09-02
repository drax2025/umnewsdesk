-- ═══════════════════════════════════════════════════════════
-- News Desk hands a selected candidate to Newsroom V1, which does
-- the editing and publishing from there.
--
-- What is recorded is the *result* of the handoff, so both systems
-- can answer "what happened to this story" — the newsroom returns a
-- workflow id and a record id, and they are kept against the
-- candidate. Without that, a candidate that has been sent looks
-- exactly like one that has not.
--
-- The error column holds the last failure, so a candidate that could
-- not be sent shows why rather than silently staying in the inbox.
--
-- Idempotent: every statement is "if not exists".
-- ═══════════════════════════════════════════════════════════

alter table public.candidates
  add column if not exists newsroom_workflow_id text,
  add column if not exists newsroom_record_id   text,
  add column if not exists sent_to_newsroom_at  timestamptz,
  add column if not exists newsroom_send_error  text;

-- The inbox filters on "already sent", so it is worth an index.
create index if not exists candidates_sent_to_newsroom_idx
  on public.candidates(sent_to_newsroom_at);

comment on column public.candidates.newsroom_workflow_id is
  'Workflow item id returned by Newsroom V1 on a successful handoff.';
comment on column public.candidates.newsroom_record_id is
  'Human-facing record id (RR-XXXXXX) in Newsroom V1.';
comment on column public.candidates.newsroom_send_error is
  'Last handoff failure, cleared on success.';
