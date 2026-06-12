-- F3 Writer produces THREE headline options per spec section F3 step 4 and
-- B6.1 click-bait-leaning policy. F5 Editor selects one (or writes a fourth)
-- per spec section F5 step 1. All three options + the agent's rationale must
-- survive into the NFP footer per H9 / C9.
--
-- Shape:
--   headline_options: jsonb array, up to 3 entries (Writer may produce fewer
--                     during drafting). Each entry:
--                     {
--                       "text":      "Edinburgh fintech ScottyPay raises £8m …",
--                       "rationale": "Click-bait-leaning per B6.1 — leads with the £ figure.",
--                       "char_count": 76
--                     }
--   headline_selected_idx: 0 | 1 | 2 | null.
--                          null = no selection yet (Writer is mid-drafting).
--                          Editor may also paste a fourth option directly into
--                          articles.headline and leave selected_idx at null —
--                          F5 spec allows it. The audit trail is the NFP footer.

alter table public.articles
  add column if not exists headline_options jsonb,
  add column if not exists headline_selected_idx smallint
    check (headline_selected_idx is null or headline_selected_idx between 0 and 2);

comment on column public.articles.headline_options is
  'F3 three-headline set per spec section F3 step 4. JSONB array of {text, rationale, char_count}. Max 3 entries.';

comment on column public.articles.headline_selected_idx is
  'F5 selection per spec section F5 step 1. 0/1/2 = pick from headline_options. NULL = no selection yet OR Editor wrote a fourth and lives in articles.headline.';
