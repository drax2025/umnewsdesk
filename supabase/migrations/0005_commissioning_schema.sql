-- ═══════════════════════════════════════════════════════════
-- Vertical slice D: Commissioning + Scheduling
--
-- Tables: commissions, schedule_entries
-- Enums:  commission_status, schedule_slot, schedule_status
-- ═══════════════════════════════════════════════════════════

create type commission_status as enum (
  'briefed',
  'accepted',
  'declined',
  'in_progress',
  'filed'
);

create type schedule_slot as enum ('am', 'pm', 'breaking', 'evergreen');

create type schedule_status as enum ('pending', 'published', 'withdrawn');

-- ─── commissions ─────────────────────────────────────────────
-- One per article. Holds brief, assignee, deadline, lifecycle status.
create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  article_id uuid not null unique references public.articles(id) on delete cascade,
  candidate_id uuid references public.candidates(id) on delete set null,
  brief text not null default '',
  assignee_id uuid references public.profiles(id) on delete set null,
  deadline_at timestamptz,
  status commission_status not null default 'briefed',
  commissioned_by uuid references public.profiles(id) on delete set null,
  commissioned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_reason text
);

create index commissions_status_idx on public.commissions(status);
create index commissions_assignee_idx on public.commissions(assignee_id);
create index commissions_deadline_idx on public.commissions(deadline_at);
create index commissions_candidate_idx on public.commissions(candidate_id);
create index commissions_commissioned_idx on public.commissions(commissioned_at desc);

-- ─── schedule_entries ────────────────────────────────────────
-- One per article. Slots the piece into a publish window.
create table public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  article_id uuid not null unique references public.articles(id) on delete cascade,
  publish_at timestamptz not null,
  slot_window schedule_slot not null default 'am',
  priority int not null default 3 check (priority between 1 and 5),
  notes text not null default '',
  status schedule_status not null default 'pending',
  scheduled_by uuid references public.profiles(id) on delete set null,
  scheduled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index schedule_entries_publish_idx on public.schedule_entries(publish_at);
create index schedule_entries_slot_idx on public.schedule_entries(slot_window);
create index schedule_entries_status_idx on public.schedule_entries(status);

-- ─── Triggers ────────────────────────────────────────────────
create trigger commissions_updated_at
  before update on public.commissions
  for each row execute function public.set_updated_at();

create trigger schedule_entries_updated_at
  before update on public.schedule_entries
  for each row execute function public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────
alter table public.commissions      enable row level security;
alter table public.schedule_entries enable row level security;

create policy "commissions_select"
  on public.commissions for select
  to authenticated using (true);
create policy "commissions_write_editor"
  on public.commissions for all
  to authenticated
  using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('senior_editor', 'editor'))
  )
  with check (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('senior_editor', 'editor'))
  );

create policy "schedule_entries_select"
  on public.schedule_entries for select
  to authenticated using (true);
create policy "schedule_entries_write_editor"
  on public.schedule_entries for all
  to authenticated
  using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('senior_editor', 'editor'))
  )
  with check (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('senior_editor', 'editor'))
  );
