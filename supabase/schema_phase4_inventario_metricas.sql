-- Metricas inventario admin: ventas web (Woo) y ventas canal mayorista.
-- Ejecutar en Supabase SQL Editor despues de schema_phase2_cache y phase3.

-- Ventas acumuladas en Woo (total_sales del REST); se actualiza con sync de catalogo.
alter table public.woo_product_cache
  add column if not exists ventas_web integer not null default 0 check (ventas_web >= 0);

create index if not exists woo_product_cache_ventas_web_idx
  on public.woo_product_cache (ventas_web desc);

-- Unidades vendidas canal B2B (solo si ya existe productos_mayoristas; si no, omitir este bloque).
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'productos_mayoristas'
  ) then
    alter table public.productos_mayoristas
      add column if not exists ventas_mayorista integer not null default 0 check (ventas_mayorista >= 0);
  end if;
end $$;

-- Legacy wholesale_products (solo si la tabla existe).
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'wholesale_products'
  ) then
    alter table public.wholesale_products
      add column if not exists precio_costo numeric(12,2) not null default 0 check (precio_costo >= 0);
    alter table public.wholesale_products
      add column if not exists ventas_mayorista integer not null default 0 check (ventas_mayorista >= 0);
  end if;
end $$;
