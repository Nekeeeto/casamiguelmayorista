-- Fase 9: estado de Ofertas Semanales (selección + narrativa) para rotación automática y edición admin.
-- Ejecutar en Supabase SQL Editor después de las fases previas (cache Woo + productos_mayoristas + es_admin).

create table if not exists public.weekly_offers_state (
  singleton text primary key check (singleton = 'default'),
  woo_product_ids bigint[] not null default '{}'::bigint[],
  ofertas_detalle jsonb not null default '[]'::jsonb,
  narrativa_resumen text not null default '',
  rotated_at timestamptz,
  week_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.weekly_offers_state is 'Única fila singleton=default: ofertas semanales curadas / rotadas desde admin o cron.';
comment on column public.weekly_offers_state.ofertas_detalle is 'Array JSON: woo_product_id, nombre, precio_regular, precio_oferta, pct_descuento, precio_costo, ventas_historicas, razon.';
comment on column public.weekly_offers_state.week_ends_at is 'Fin de ventana promocional sugerida (p. ej. +7 días desde rotated_at).';

create or replace function public.set_updated_at_weekly_offers_state()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_weekly_offers_state on public.weekly_offers_state;
create trigger trg_set_updated_at_weekly_offers_state
before update on public.weekly_offers_state
for each row
execute function public.set_updated_at_weekly_offers_state();

alter table public.weekly_offers_state enable row level security;

drop policy if exists "weekly_offers_state_select_admin" on public.weekly_offers_state;
create policy "weekly_offers_state_select_admin"
on public.weekly_offers_state
for select
to authenticated
using (public.es_admin());

drop policy if exists "weekly_offers_state_write_admin" on public.weekly_offers_state;
create policy "weekly_offers_state_write_admin"
on public.weekly_offers_state
for insert
to authenticated
with check (public.es_admin());

drop policy if exists "weekly_offers_state_update_admin" on public.weekly_offers_state;
create policy "weekly_offers_state_update_admin"
on public.weekly_offers_state
for update
to authenticated
using (public.es_admin())
with check (public.es_admin());

insert into public.weekly_offers_state (singleton, narrativa_resumen, week_ends_at)
values (
  'default',
  'Aún no se ejecutó una rotación. Usá «Rotar ahora» o esperá el cron del lunes.',
  now() + interval '7 days'
)
on conflict (singleton) do nothing;
