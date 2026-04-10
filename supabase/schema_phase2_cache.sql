-- Fase 2: cache de catálogo Woo para lectura rápida en admin.
-- Ejecutar este script en Supabase SQL Editor.

create table if not exists public.woo_product_cache (
  woo_product_id bigint primary key,
  sku text,
  name text not null,
  base_price numeric(12,2) not null default 0,
  image_url text,
  status text not null default 'publish',
  woo_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists woo_product_cache_status_idx
  on public.woo_product_cache (status);

create index if not exists woo_product_cache_woo_updated_at_idx
  on public.woo_product_cache (woo_updated_at desc);

create or replace function public.set_updated_at_woo_product_cache()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_woo_product_cache on public.woo_product_cache;
create trigger trg_set_updated_at_woo_product_cache
before update on public.woo_product_cache
for each row
execute function public.set_updated_at_woo_product_cache();

alter table public.woo_product_cache enable row level security;

drop policy if exists "woo_product_cache_select_authenticated" on public.woo_product_cache;
create policy "woo_product_cache_select_authenticated"
on public.woo_product_cache
for select
to authenticated
using (true);

drop policy if exists "woo_product_cache_insert_authenticated" on public.woo_product_cache;
create policy "woo_product_cache_insert_authenticated"
on public.woo_product_cache
for insert
to authenticated
with check (true);

drop policy if exists "woo_product_cache_update_authenticated" on public.woo_product_cache;
create policy "woo_product_cache_update_authenticated"
on public.woo_product_cache
for update
to authenticated
using (true)
with check (true);

drop policy if exists "woo_product_cache_delete_authenticated" on public.woo_product_cache;
create policy "woo_product_cache_delete_authenticated"
on public.woo_product_cache
for delete
to authenticated
using (true);
