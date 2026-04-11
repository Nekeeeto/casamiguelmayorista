-- Proveedores + vinculacion a productos mayoristas.
-- Ejecutar en Supabase SQL Editor despues de schema_phase2 y phase4.

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre_fantasia text not null,
  logo_url text,
  rut text,
  email text,
  telefono text,
  contacto text,
  notas text
);

create index if not exists proveedores_nombre_fantasia_idx
  on public.proveedores (nombre_fantasia);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'productos_mayoristas'
  ) then
    alter table public.productos_mayoristas
      add column if not exists proveedor_id uuid;
    alter table public.productos_mayoristas
      drop constraint if exists productos_mayoristas_proveedor_id_fkey;
    alter table public.productos_mayoristas
      add constraint productos_mayoristas_proveedor_id_fkey
      foreign key (proveedor_id)
      references public.proveedores (id)
      on delete set null;
    create index if not exists productos_mayoristas_proveedor_id_idx
      on public.productos_mayoristas (proveedor_id);
  end if;
end $$;

-- Legacy: mantener compatibilidad si aun se usa wholesale_products.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'wholesale_products'
  ) then
    alter table public.wholesale_products
      add column if not exists proveedor_id uuid;
    alter table public.wholesale_products
      drop constraint if exists wholesale_products_proveedor_id_fkey;
    alter table public.wholesale_products
      add constraint wholesale_products_proveedor_id_fkey
      foreign key (proveedor_id)
      references public.proveedores (id)
      on delete set null;
    create index if not exists wholesale_products_proveedor_id_idx
      on public.wholesale_products (proveedor_id);
  end if;
end $$;
