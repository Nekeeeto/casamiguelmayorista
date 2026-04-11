-- Fase 3: Base B2B dual (Tienda + Admin) con RLS estricto.
-- Ejecutar en Supabase SQL Editor.

-- =========================================================
-- 1) Funciones auxiliares de seguridad
-- =========================================================
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles_usuarios p
    where p.id = auth.uid()
      and p.rol = 'admin'
  );
$$;

grant execute on function public.es_admin() to authenticated;

-- =========================================================
-- 2) Perfiles de usuario (vinculado a auth.users)
-- =========================================================
create table if not exists public.perfiles_usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  rol text not null default 'pendiente' check (rol in ('admin', 'pendiente', 'aprobado')),
  nombre_empresa text,
  rut text,
  datos_onboarding jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists perfiles_usuarios_rol_idx
  on public.perfiles_usuarios (rol);

alter table public.perfiles_usuarios enable row level security;

drop policy if exists "perfiles_select_owner_or_admin" on public.perfiles_usuarios;
create policy "perfiles_select_owner_or_admin"
on public.perfiles_usuarios
for select
to authenticated
using (auth.uid() = id or public.es_admin());

drop policy if exists "perfiles_insert_owner_pending" on public.perfiles_usuarios;
create policy "perfiles_insert_owner_pending"
on public.perfiles_usuarios
for insert
to authenticated
with check (auth.uid() = id and rol = 'pendiente');

drop policy if exists "perfiles_update_admin_only" on public.perfiles_usuarios;
create policy "perfiles_update_admin_only"
on public.perfiles_usuarios
for update
to authenticated
using (public.es_admin())
with check (public.es_admin());

drop policy if exists "perfiles_delete_admin_only" on public.perfiles_usuarios;
create policy "perfiles_delete_admin_only"
on public.perfiles_usuarios
for delete
to authenticated
using (public.es_admin());

-- =========================================================
-- 3) Productos mayoristas (con costo y escalas)
-- =========================================================
create table if not exists public.productos_mayoristas (
  id bigserial primary key,
  woo_product_id bigint unique,
  sku text,
  nombre text not null,
  precio_venta numeric(12,2),
  precio_costo numeric(12,2) not null default 0 check (precio_costo >= 0),
  escalas_volumen jsonb not null default '[]'::jsonb,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint productos_mayoristas_escalas_es_array
    check (jsonb_typeof(escalas_volumen) = 'array')
);

alter table public.productos_mayoristas
  add column if not exists precio_costo numeric(12,2) not null default 0 check (precio_costo >= 0);

alter table public.productos_mayoristas
  add column if not exists escalas_volumen jsonb not null default '[]'::jsonb;

create index if not exists productos_mayoristas_woo_product_id_idx
  on public.productos_mayoristas (woo_product_id);

create index if not exists productos_mayoristas_activo_idx
  on public.productos_mayoristas (activo);

create or replace function public.set_actualizado_en_productos_mayoristas()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_set_actualizado_en_productos_mayoristas on public.productos_mayoristas;
create trigger trg_set_actualizado_en_productos_mayoristas
before update on public.productos_mayoristas
for each row
execute function public.set_actualizado_en_productos_mayoristas();

alter table public.productos_mayoristas enable row level security;

drop policy if exists "productos_select_aprobado_o_admin" on public.productos_mayoristas;
create policy "productos_select_aprobado_o_admin"
on public.productos_mayoristas
for select
to authenticated
using (
  public.es_admin()
  or exists (
    select 1
    from public.perfiles_usuarios p
    where p.id = auth.uid()
      and p.rol = 'aprobado'
  )
);

drop policy if exists "productos_insert_admin_only" on public.productos_mayoristas;
create policy "productos_insert_admin_only"
on public.productos_mayoristas
for insert
to authenticated
with check (public.es_admin());

drop policy if exists "productos_update_admin_only" on public.productos_mayoristas;
create policy "productos_update_admin_only"
on public.productos_mayoristas
for update
to authenticated
using (public.es_admin())
with check (public.es_admin());

drop policy if exists "productos_delete_admin_only" on public.productos_mayoristas;
create policy "productos_delete_admin_only"
on public.productos_mayoristas
for delete
to authenticated
using (public.es_admin());

-- =========================================================
-- 4) Carrito B2B persistente multi-dispositivo
-- =========================================================
create table if not exists public.carritos_b2b (
  id_usuario uuid primary key references auth.users (id) on delete cascade,
  articulos jsonb not null default '[]'::jsonb,
  actualizado_en timestamptz not null default now(),
  constraint carritos_b2b_articulos_es_array
    check (jsonb_typeof(articulos) = 'array')
);

create or replace function public.set_actualizado_en_carritos_b2b()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_set_actualizado_en_carritos_b2b on public.carritos_b2b;
create trigger trg_set_actualizado_en_carritos_b2b
before update on public.carritos_b2b
for each row
execute function public.set_actualizado_en_carritos_b2b();

alter table public.carritos_b2b enable row level security;

drop policy if exists "carritos_select_owner_or_admin" on public.carritos_b2b;
create policy "carritos_select_owner_or_admin"
on public.carritos_b2b
for select
to authenticated
using (auth.uid() = id_usuario or public.es_admin());

drop policy if exists "carritos_insert_owner_or_admin" on public.carritos_b2b;
create policy "carritos_insert_owner_or_admin"
on public.carritos_b2b
for insert
to authenticated
with check (auth.uid() = id_usuario or public.es_admin());

drop policy if exists "carritos_update_owner_or_admin" on public.carritos_b2b;
create policy "carritos_update_owner_or_admin"
on public.carritos_b2b
for update
to authenticated
using (auth.uid() = id_usuario or public.es_admin())
with check (auth.uid() = id_usuario or public.es_admin());

drop policy if exists "carritos_delete_owner_or_admin" on public.carritos_b2b;
create policy "carritos_delete_owner_or_admin"
on public.carritos_b2b
for delete
to authenticated
using (auth.uid() = id_usuario or public.es_admin());
