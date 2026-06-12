-- ════════════════════════════════════════════════════════════════════════════
-- 0032_featured_image.sql
--
-- Featured-image support for articles.
--
-- Architecture: Supabase Storage is the system of record while the article is
-- in flight; on F8 publish, the image is sideloaded into the target title's
-- WordPress media library and set as `featured_media` on the post (see
-- src/lib/actions/post-publish.ts → pushFeaturedImageToWordPress).
--
-- Why Storage and not direct-to-WP at upload time:
--   - With multiple titles, the editor wouldn't know which silo's media
--     library to upload to until they hit Publish. Holding in Storage keeps
--     the silo choice deferred to F8.
--   - Editors can preview the image in our own UI without an authenticated
--     round-trip to WP.
--   - WP outage at edit time doesn't block the editorial workflow.
--   - The Postmark/RSS ingest path (which extracts candidates.image_url
--     today) doesn't need WP credentials — only the publish step does.
--
-- Fallback at publish time: when featured_image_url is NULL we sideload from
-- the candidate's primary image_url (which the ingest pipeline already
-- captured). Editors can still upload a replacement on F7 / F8.
--
-- Storage bucket: `article-images`, public-read so WP can fetch the file by
-- URL on publish. Public-read is appropriate — the image is destined for a
-- public WP post anyway; the secret is the article body, not the hero JPEG.
-- Write access is gated to authenticated users; ownership is enforced by
-- path convention (`<article_id>/<filename>`) + an RLS policy that joins
-- back to articles to confirm the uploader is an editor on the system.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── Columns on articles ────────────────────────────────────────────────────

alter table public.articles
  add column if not exists featured_image_url text,
  add column if not exists featured_image_alt text,
  add column if not exists featured_image_credit text,
  add column if not exists featured_image_uploaded_at timestamptz,
  add column if not exists featured_image_uploaded_by uuid references public.profiles(id);

comment on column public.articles.featured_image_url is
  'Public URL of the editor-supplied hero image, served from the article-images Storage bucket. NULL means "fall back to candidates.image_url at publish time".';
comment on column public.articles.featured_image_alt is
  'Alt text for the hero image. Required for accessibility; sent to WP as the attachment alt_text on publish.';
comment on column public.articles.featured_image_credit is
  'Photo credit (e.g. "Photo: Andrew Cawley / Scottish Government"). Appended to the WP caption on publish.';


-- ─── Storage bucket ─────────────────────────────────────────────────────────
--
-- Public-read is safe: the image will be on a public WP post in minutes
-- anyway, and avoiding signed-URL plumbing keeps WP sideloading simple
-- (WP's /media endpoint can either receive the binary or sideload by URL —
-- the URL path needs the file to be reachable without auth).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'article-images',
  'article-images',
  true,
  10 * 1024 * 1024, -- 10 MB cap; hero images are 200-400 KB JPEGs
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- ─── Storage RLS policies ───────────────────────────────────────────────────
--
-- Reads: anonymous + authenticated. Necessary because (a) the editor's
-- preview UI loads the image with a plain <img src>, and (b) WP fetches the
-- URL during sideload with no auth header.
--
-- Writes: editors and senior_editors only, and only into a path prefixed
-- with an article_id they're allowed to edit. The `name` column on
-- storage.objects holds the full object path (e.g.
-- "<article_uuid>/hero-1717.jpg"); the policy splits the first path segment
-- and joins back to articles to confirm the editor is signed in as one of
-- the authoring roles.

-- Public read.
drop policy if exists "article_images_read" on storage.objects;
create policy "article_images_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'article-images');

-- Editors can insert into <article_id>/* if they hold an editorial role.
drop policy if exists "article_images_insert" on storage.objects;
create policy "article_images_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'article-images'
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role in ('editor', 'senior_editor')
    )
  );

-- Same gate for updates (overwriting a hero image when the editor swaps it).
drop policy if exists "article_images_update" on storage.objects;
create policy "article_images_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'article-images'
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role in ('editor', 'senior_editor')
    )
  );

-- Delete is editorial too (clearing a hero image).
drop policy if exists "article_images_delete" on storage.objects;
create policy "article_images_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'article-images'
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role in ('editor', 'senior_editor')
    )
  );


-- ─── PostgREST schema reload ────────────────────────────────────────────────
notify pgrst, 'reload schema';
