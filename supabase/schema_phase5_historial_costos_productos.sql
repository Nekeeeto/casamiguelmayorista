-- Historial de cambios de costo por producto Woo (auditoria).
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.historial_costos_productos (
  id uuid primary key default gen_random_uuid(),
  woo_product_id bigint not null references public.woo_product_cache (woo_product_id) on delete cascade,
  costo_anterior numeric(12,2) not null check (costo_anterior >= 0),
  costo_nuevo numeric(12,2) not null check (costo_nuevo >= 0),
  modificado_por uuid null references auth.users (id) on delete set null,
  fecha_modificacion timestamptz not null default now()
);

create index if not exists historial_costos_productos_woo_idx
  on public.historial_costos_productos (woo_product_id, fecha_modificacion desc);
