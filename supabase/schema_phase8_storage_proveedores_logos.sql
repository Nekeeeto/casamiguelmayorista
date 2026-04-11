-- Bucket y políticas para logos de proveedores (Storage).
-- Ejecutar en Supabase SQL Editor si no se usa MCP migrations.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proveedores-logos',
  'proveedores-logos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read proveedores logos" on storage.objects;
create policy "Public read proveedores logos"
on storage.objects
for select
using (bucket_id = 'proveedores-logos');

drop policy if exists "Authenticated upload proveedores logos" on storage.objects;
create policy "Authenticated upload proveedores logos"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'proveedores-logos');

drop policy if exists "Authenticated update proveedores logos" on storage.objects;
create policy "Authenticated update proveedores logos"
on storage.objects
for update
to authenticated
using (bucket_id = 'proveedores-logos')
with check (bucket_id = 'proveedores-logos');

drop policy if exists "Authenticated delete proveedores logos" on storage.objects;
create policy "Authenticated delete proveedores logos"
on storage.objects
for delete
to authenticated
using (bucket_id = 'proveedores-logos');
