-- ═══════════════════════════════════════════════════════════
-- Featured image URL on candidates.
--
-- Inbox listing wants a thumbnail per row. RSS feeds expose this via
-- enclosure / media:content / og:image / etc — the ingestion runner
-- normalises whichever path the source uses and posts a single
-- `image_url` on the item envelope. We persist it directly so the
-- inbox SELECT can render without dragging the full `raw` jsonb.
--
-- Nullable: many sources (especially feeds without enclosures) have
-- nothing to offer. The UI falls back to a neutral placeholder.
-- ═══════════════════════════════════════════════════════════

alter table public.candidates
  add column if not exists image_url text;
