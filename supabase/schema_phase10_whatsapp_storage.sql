-- Bucket público para URLs HTTPS que Meta pueda descargar (headers de plantilla, adjuntos bandeja).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "whatsapp_media_public_read" on storage.objects;
create policy "whatsapp_media_public_read"
on storage.objects for select
to public
using (bucket_id = 'whatsapp-media');

drop policy if exists "whatsapp_media_admin_all" on storage.objects;
create policy "whatsapp_media_admin_all"
on storage.objects for all
to authenticated
using (bucket_id = 'whatsapp-media' and public.es_admin())
with check (bucket_id = 'whatsapp-media' and public.es_admin());
