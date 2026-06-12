-- ════════════════════════════════════════════════════════════════════════
-- A3 editorial opportunities pipeline + K5 Friday sweep — item 9
--
-- Extends article_pipeline_opportunities with the five A3 sections
-- (A Profile / B Follow-up / C Cluster-build / D Cross-pub / E Recurring
-- beat), title_id (for title-scoped queries), and K5 verdict columns.
-- Adds reject_queue_sweep for K5 weekly Reject Queue verdicts.
-- ════════════════════════════════════════════════════════════════════════

create type opportunity_section as enum (
  'a_profile',         -- profile pieces (subject-led features)
  'b_followup',        -- direct follow-ups to a published article
  'c_cluster_build',   -- cluster-build (multi-article series on a theme)
  'd_cross_pub',       -- cross-publication candidates (same story, another title)
  'e_recurring_beat'   -- recurring beats (a watch / a tracker)
);

create type opportunity_verdict as enum (
  'pending',           -- in the active list; awaiting Friday review
  'commission',        -- promote to the rota
  'park',              -- keep on the list; revisit later
  'drop'               -- archive — not pursued
);

alter table public.article_pipeline_opportunities
  add column if not exists section opportunity_section
    not null default 'b_followup',
  add column if not exists title_id uuid references public.titles(id)
    on delete restrict,
  add column if not exists verdict opportunity_verdict
    not null default 'pending',
  add column if not exists verdict_at timestamptz,
  add column if not exists verdict_by uuid references public.profiles(id),
  add column if not exists verdict_notes text,
  add column if not exists sweep_count smallint not null default 0,
  add column if not exists last_swept_at timestamptz;

-- Backfill title_id from the source article so the K5 view is title-scoped.
update public.article_pipeline_opportunities o
   set title_id = a.title_id
  from public.articles a
 where a.id = o.article_id
   and o.title_id is null;

create index if not exists article_pipeline_opportunities_title_idx
  on public.article_pipeline_opportunities(title_id);
create index if not exists article_pipeline_opportunities_verdict_idx
  on public.article_pipeline_opportunities(verdict);
create index if not exists article_pipeline_opportunities_section_idx
  on public.article_pipeline_opportunities(section);

comment on column public.article_pipeline_opportunities.section is
  'A3 section: A Profile / B Follow-up / C Cluster-build / D Cross-pub / E Recurring beat.';
comment on column public.article_pipeline_opportunities.verdict is
  'K5 Friday sweep verdict: pending / commission / park / drop.';
comment on column public.article_pipeline_opportunities.sweep_count is
  'How many Friday sweeps have touched this row — drives 4-sweep auto-drop policy.';

-- ─── reject_queue_sweep ─────────────────────────────────────────
-- K5 weekly Reject Queue verdicts. One row per (article, sweep iteration).

create type reject_sweep_verdict as enum (
  'pursue_manual',
  'hold',
  'drop'
);

create table public.reject_queue_sweep (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  verdict reject_sweep_verdict not null,
  notes text,
  swept_at timestamptz not null default now(),
  swept_by uuid references public.profiles(id),
  iteration smallint not null default 1
);

create index reject_queue_sweep_article_idx
  on public.reject_queue_sweep(article_id);
create index reject_queue_sweep_swept_at_idx
  on public.reject_queue_sweep(swept_at desc);

alter table public.reject_queue_sweep enable row level security;

create policy "reject_queue_sweep_select_authenticated"
  on public.reject_queue_sweep for select
  using (auth.role() = 'authenticated');

create policy "reject_queue_sweep_write_senior"
  on public.reject_queue_sweep for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'senior_editor'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'senior_editor'
    )
  );

comment on table public.reject_queue_sweep is
  'K5 weekly Reject Queue verdicts — Senior Editor PURSUE-MANUAL / HOLD / DROP per sweep iteration.';
