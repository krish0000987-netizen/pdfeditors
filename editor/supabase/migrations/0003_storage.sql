-- ============================================================
-- EDITOR — private storage bucket + owner-scoped policies
-- Path convention:
--   documents/{user_id}/{document_id}/{original|versions|exports|thumbnails}/...
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 104857600, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Owners can list/read their own user folder
create policy "documents_owner_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Owners can upload into their own folder
create policy "documents_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Owners can update/overwrite their own objects
create policy "documents_owner_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Owners can delete their own objects
create policy "documents_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role bypasses RLS on storage automatically (supabase_admin role),
-- so the server can write version files into any user folder.
