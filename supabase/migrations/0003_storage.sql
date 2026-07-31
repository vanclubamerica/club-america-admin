-- =============================================================================
-- Storage buckets
--
-- Two buckets with deliberately different privacy postures:
--
--   media      — public. Officer photos, sponsor logos, news images and theme
--                assets all end up committed to the public website repo, so
--                treating them as secret would be theatre. Public read makes
--                previews and the editor UI simple.
--
--   documents  — private. Constitutions, meeting agendas, forms and sponsor
--                packets are internal club records. Read access requires an
--                authenticated admin, and downloads use short-lived signed URLs.
--
-- File-type enforcement lives in application code (magic-byte sniffing in
-- src/lib/uploads.ts), because Storage policies cannot inspect file contents.
-- The size caps here are a backstop against oversized uploads.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'media',
    'media',
    true,
    5242880,  -- 5 MB
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
  ),
  (
    'documents',
    'documents',
    false,
    20971520, -- 20 MB
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'image/png',
      'image/jpeg'
    ]
  )
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- media bucket
-- -----------------------------------------------------------------------------

-- Anyone may read; these images are destined for a public website.
create policy "media_public_read"
  on storage.objects for select
  using (bucket_id = 'media');

-- Only active, non-locked admins may add or change images.
create policy "media_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.can_edit_content());

create policy "media_admin_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.can_edit_content())
  with check (bucket_id = 'media' and public.can_edit_content());

create policy "media_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.can_edit_content());

-- -----------------------------------------------------------------------------
-- documents bucket — no anonymous access at all
-- -----------------------------------------------------------------------------
create policy "documents_admin_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.is_active_admin());

create policy "documents_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.can_edit_content());

create policy "documents_admin_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents' and public.can_edit_content())
  with check (bucket_id = 'documents' and public.can_edit_content());

create policy "documents_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.can_edit_content());
