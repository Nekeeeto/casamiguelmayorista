-- Stock en caché de productos Woo (listado inventario admin).
-- Ejecutar en Supabase SQL Editor después de schema_phase2 y phase4.

alter table public.woo_product_cache
  add column if not exists stock_status text not null default 'instock',
  add column if not exists manage_stock boolean not null default false,
  add column if not exists stock_quantity integer;

comment on column public.woo_product_cache.stock_status is 'Woo: instock | outofstock | onbackorder';
comment on column public.woo_product_cache.manage_stock is 'Woo: si se gestiona cantidad';
comment on column public.woo_product_cache.stock_quantity is 'Woo: cantidad si manage_stock; si no, null';
