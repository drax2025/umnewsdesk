-- ═══════════════════════════════════════════════════════════════════════════
-- 0047_candidate_rejection_columns.sql
--
-- Second half of the rejection port. Split from 0046 because Postgres refuses
-- to use an enum value in the same transaction that added it, and the function
-- below writes 'rejected'.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.candidates
  add column if not exists rejected_reason text,
  add column if not exists rejected_note   text,
  add column if not exists rejected_by     uuid references public.profiles(id) on delete set null,
  add column if not exists rejected_at     timestamptz;

comment on column public.candidates.rejected_reason is
  'One of the eight closed reasons in src/lib/spec/rejection.ts. Closed on purpose: free text produces forty spellings of "duplicate" and nothing countable.';
comment on column public.candidates.rejected_note is
  'Free text. Required when the reason is "Other" — that is the escape hatch, and it has to say something.';
comment on column public.candidates.rejected_by is
  'The profile that rejected it. V1 stored a display name and found that renaming a user rewrote history; this stores the id and joins for the name.';

create index if not exists candidates_rejected_idx
  on public.candidates(rejected_at desc)
  where rejected_at is not null;

-- ─── the one write path ────────────────────────────────────────────────────
-- Single and bulk both call this, once per candidate. Keeping one path means
-- permissions, attribution and the timestamp cannot drift between them — which
-- is the reason V1 makes one API call per story even in bulk.
--
-- SECURITY INVOKER, so RLS on candidates still applies.
create or replace function public.reject_candidate(
  p_id uuid,
  p_reason text,
  p_note text
) returns table (id uuid, code text)
language plpgsql
security invoker
as $$
declare
  v_role text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to reject a candidate';
  end if;
  -- "Other" is the escape hatch; it has to say something.
  if p_reason = 'Other' and (p_note is null or btrim(p_note) = '') then
    raise exception 'A note is required when the reason is Other';
  end if;

  -- Hiding a button is a courtesy; this is the rule.
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('editor', 'admin') then
    raise exception 'Not permitted to reject candidates';
  end if;

  return query
  update public.candidates c
     set triage_state    = 'rejected',
         rejected_reason = p_reason,
         rejected_note   = nullif(btrim(coalesce(p_note, '')), ''),
         rejected_by     = auth.uid(),
         -- Never moves once set: a repeated update must not rewrite the
         -- original moment.
         rejected_at     = coalesce(c.rejected_at, now())
   where c.id = p_id
  returning c.id, c.code;
end;
$$;

comment on function public.reject_candidate is
  'Reject one candidate. Reason mandatory, note mandatory when reason is Other, attribution and timestamp taken from the session. rejected_at is COALESCEd so a repeat cannot move it.';
