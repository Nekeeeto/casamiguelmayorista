-- Historial de importaciones CSV (inventario / costos). Ejecutar en Supabase SQL Editor.
-- El panel admin inserta filas vía service role (sin depender de RLS para escritura).

create table if not exists public.importaciones_inventario_csv (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre_archivo text,
  mapeo jsonb not null default '{}'::jsonb,
  resultado jsonb not null
);

create index if not exists importaciones_inventario_csv_created_at_idx
  on public.importaciones_inventario_csv (created_at desc);

comment on table public.importaciones_inventario_csv is
  'Registro de cada importación CSV desde el admin (costos/proveedor por SKU).';
