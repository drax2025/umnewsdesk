-- ════════════════════════════════════════════════════════════════════════
-- Pack renderer storage — item 7
--
-- The 12-section pack rendered to markdown. Stored in-database so Vercel's
-- read-only filesystem doesn't lose it; also written to disk in dev where
-- the working tree is writable.
--
-- archive_markdown    : the rendered text (canonical copy)
-- archive_signature   : sha256 of the markdown (tamper detection)
-- ════════════════════════════════════════════════════════════════════════

alter table public.pre_publish_packs
  add column if not exists archive_markdown text,
  add column if not exists archive_signature text;

comment on column public.pre_publish_packs.archive_markdown is
  '12-section pack markdown rendered at PUB-PASS. Canonical archive copy.';
comment on column public.pre_publish_packs.archive_signature is
  'SHA-256 of archive_markdown — tamper-detection for the published pack.';
