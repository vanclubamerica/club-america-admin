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
--
-- NOTE ON PERMISSIONS
-- `storage.objects` is owned by Supabase's storage role, and many projects do
-- not let the SQL Editor create policies on it directly. Every statement below
-- is therefore wrapped so a permission error prints a notice instead of
-- aborting the migration. If you see those notices, create the policies from
-- the dashboard instead — see the bottom of this file for exactly what to add.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'media',
    'media',
    true,
    5242880,  -- 5 MB
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
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
-- Policies
--
-- Applied through a helper so that a lack of ownership on storage.objects
-- degrades to a notice rather than failing the whole migration.
-- -----------------------------------------------------------------------------
do $$
declare
  stmt text;
  statements text[] := array[
    -- media: public read, admin write
    $p$create policy "media_public_read" on storage.objects
        for select using (bucket_id = 'media')$p$,
    $p$create policy "media_admin_insert" on storage.objects
        for insert to authenticated
        with check (bucket_id = 'media' and public.can_edit_content())$p$,
    $p$create policy "media_admin_update" on storage.objects
        for update to authenticated
        using (bucket_id = 'media' and public.can_edit_content())
        with check (bucket_id = 'media' and public.can_edit_content())$p$,
    $p$create policy "media_admin_delete" on storage.objects
        for delete to authenticated
        using (bucket_id = 'media' and public.can_edit_content())$p$,

    -- documents: no anonymous access at all
    $p$create policy "documents_admin_read" on storage.objects
        for select to authenticated
        using (bucket_id = 'documents' and public.is_active_admin())$p$,
    $p$create policy "documents_admin_insert" on storage.objects
        for insert to authenticated
        with check (bucket_id = 'documents' and public.can_edit_content())$p$,
    $p$create policy "documents_admin_update" on storage.objects
        for update to authenticated
        using (bucket_id = 'documents' and public.can_edit_content())
        with check (bucket_id = 'documents' and public.can_edit_content())$p$,
    $p$create policy "documents_admin_delete" on storage.objects
        for delete to authenticated
        using (bucket_id = 'documents' and public.can_edit_content())$p$
  ];
  skipped int := 0;
begin
  foreach stmt in array statements loop
    begin
      execute stmt;
    exception
      when insufficient_privilege then
        skipped := skipped + 1;
      when duplicate_object then
        null; -- already created by a previous run
    end;
  end loop;

  if skipped > 0 then
    raise notice
      'Skipped % storage policy statement(s) — this project does not allow creating policies on storage.objects from SQL. Create them from the Storage dashboard instead; see the comment at the bottom of 0003_storage.sql.',
      skipped;
  else
    raise notice 'Storage policies installed.';
  end if;
end;
$$;

-- =============================================================================
-- If the notice above said policies were skipped, add them by hand:
--
--   Supabase dashboard -> Storage -> Policies -> New policy (on `objects`)
--
-- media bucket
--   SELECT  target: public          USING:  bucket_id = 'media'
--   INSERT  target: authenticated   CHECK:  bucket_id = 'media'
--                                             and public.can_edit_content()
--   UPDATE  target: authenticated   USING and CHECK: same as INSERT
--   DELETE  target: authenticated   USING:  same as INSERT
--
-- documents bucket
--   SELECT  target: authenticated   USING:  bucket_id = 'documents'
--                                             and public.is_active_admin()
--   INSERT  target: authenticated   CHECK:  bucket_id = 'documents'
--                                             and public.can_edit_content()
--   UPDATE  target: authenticated   USING and CHECK: same as INSERT
--   DELETE  target: authenticated   USING:  same as INSERT
--
-- The helper functions is_active_admin() and can_edit_content() were created by
-- 0001_init.sql, so you can reference them directly in the policy editor.
-- =============================================================================
