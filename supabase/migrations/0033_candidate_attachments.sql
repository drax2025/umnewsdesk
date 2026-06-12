-- ════════════════════════════════════════════════════════════════════════════
-- 0033_candidate_attachments.sql
--
-- Mirror Postmark image attachments to Storage so the editor can pick one as
-- the featured image without re-uploading.
--
-- Why a new column instead of repurposing `candidates.attachment_urls`:
--   The existing column is `text[]` and holds *filenames* (the comment at
--   the call site says "MVP: names only. Phase 2: mirror to Storage."). The
--   inbox AttachmentChip already reads it as names — repurposing would
--   silently break that. Adding a structured `attachments` JSONB column
--   alongside is additive and back-compat.
--
-- Bucket: `candidate-attachments`, public-read so:
--   - the FeaturedImagePanel can render <img src> thumbnails without auth
--   - the setFeaturedImageFromAttachment server action's fetch() from
--     candidate-attachments → article-images copy works with no signed URL
--     juggling
--
-- Writes are service-role only — the Postmark ingest is the sole producer.
-- No editor needs to upload directly into this bucket; they edit by picking
-- one (which copies into article-images).
--
-- Scope intentionally limited:
--   - Only image MIME types (image/jpeg, image/png, image/webp, image/gif).
--     PDFs / DOCX are already text-extracted; storing the binaries too would
--     waste storage with no editorial use.
--   - 5 MB per-attachment cap — Postmark inbound itself caps at ~10 MB total
--     payload, and PR hero images very rarely exceed 2-3 MB.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── Columns on candidates ──────────────────────────────────────────────────

alter table public.candidates
  add column if not exists attachments jsonb;

comment on column public.candidates.attachments is
  'Structured list of mirrored attachments: [{ name, url, content_type, size }]. Populated at ingest time for image MIME types only; PDFs/DOCX are text-extracted into body_text and not mirrored. Distinct from attachment_urls (which holds filename strings only — kept for back-compat with the inbox chip).';


-- ─── Storage bucket ─────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-attachments',
  'candidate-attachments',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- ─── Storage RLS policies ───────────────────────────────────────────────────
--
-- Read: anonymous + authenticated. Necessary for editor preview <img> tags
-- and for the server-side copy into article-images on featured-image pick.
--
-- Write / Update / Delete: service_role only. The Postmark ingest webhook is
-- the only producer. No `authenticated` policy because no human uploads into
-- this bucket directly.

drop policy if exists "candidate_attachments_read" on storage.objects;
create policy "candidate_attachments_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'candidate-attachments');

-- Note: service_role bypasses RLS, so no explicit insert/update/delete
-- policies are needed. We intentionally omit `authenticated` write policies
-- so a logged-in user can't write to this bucket from the browser.


-- ─── PostgREST schema reload ────────────────────────────────────────────────
notify pgrst, 'reload schema';
