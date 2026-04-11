-- Categorias Woo + IDs en cache de productos (filtrado admin inventario).
-- Ejecutar en Supabase SQL Editor despues de schema_phase2_cache.sql.

-- Taxonomia product_cat sincronizada desde WooCommerce REST.
create table if not exists public.woo_category_cache (
  woo_term_id bigint primary key,
  nombre text not null,
  slug text not null,
  id_padre bigint not null default 0,
  sincronizado_en timestamptz not null default now()
);

create index if not exists woo_category_cache_id_padre_idx
  on public.woo_category_cache (id_padre);

create index if not exists woo_category_cache_nombre_idx
  on public.woo_category_cache (nombre);

alter table public.woo_product_cache
  add column if not exists categoria_ids bigint[] not null default '{}';

create index if not exists woo_product_cache_categoria_ids_gin_idx
  on public.woo_product_cache using gin (categoria_ids);

alter table public.woo_category_cache enable row level security;

drop policy if exists "woo_category_cache_select_authenticated" on public.woo_category_cache;
create policy "woo_category_cache_select_authenticated"
on public.woo_category_cache
for select
to authenticated
using (true);

drop policy if exists "woo_category_cache_insert_authenticated" on public.woo_category_cache;
create policy "woo_category_cache_insert_authenticated"
on public.woo_category_cache
for insert
to authenticated
with check (true);

drop policy if exists "woo_category_cache_update_authenticated" on public.woo_category_cache;
create policy "woo_category_cache_update_authenticated"
on public.woo_category_cache
for update
to authenticated
using (true)
with check (true);

drop policy if exists "woo_category_cache_delete_authenticated" on public.woo_category_cache;
create policy "woo_category_cache_delete_authenticated"
on public.woo_category_cache
for delete
to authenticated
using (true);
