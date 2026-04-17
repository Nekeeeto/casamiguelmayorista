-- Fase 10: módulo WhatsApp Marketing (single-tenant Casa Miguel).
-- Ejecutar en Supabase SQL Editor después de las fases previas.
-- Tablas: whatsapp_config, whatsapp_system_templates, whatsapp_messages,
--         whatsapp_triggers, whatsapp_broadcasts, whatsapp_broadcast_results,
--         whatsapp_contacts.

-- =========================================================================
-- 0. Prerrequisito RLS: función public.es_admin() (misma definición que fase 3)
-- Si falla aquí con "relation perfiles_usuarios does not exist", corré antes
-- supabase/schema_phase3_b2b_core.sql (al menos la parte de perfiles + es_admin).
-- =========================================================================
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

-- =========================================================================
-- 1. Configuración (singleton)
-- =========================================================================
create table if not exists public.whatsapp_config (
  id int primary key check (id = 1),
  phone_number_id text,
  access_token text,
  webhook_verify_token text,
  waba_id text,
  pricing jsonb not null default jsonb_build_object(
    'marketing', 0.055,
    'utility', 0.0137,
    'authentication', 0.0312
  ),
  updated_at timestamptz not null default now()
);

comment on table public.whatsapp_config is 'Única fila id=1 con credenciales de WhatsApp Cloud API (Meta) y pricing por categoría USD.';

insert into public.whatsapp_config (id) values (1) on conflict (id) do nothing;

alter table public.whatsapp_config enable row level security;

drop policy if exists "whatsapp_config_select_admin" on public.whatsapp_config;
create policy "whatsapp_config_select_admin"
on public.whatsapp_config
for select
to authenticated
using (public.es_admin());

drop policy if exists "whatsapp_config_write_admin" on public.whatsapp_config;
create policy "whatsapp_config_write_admin"
on public.whatsapp_config
for all
to authenticated
using (public.es_admin())
with check (public.es_admin());

-- =========================================================================
-- 2. Templates del sistema (texto libre, editables)
-- =========================================================================
create table if not exists public.whatsapp_system_templates (
  key text primary key,
  descripcion text not null default '',
  texto text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.whatsapp_system_templates is 'Templates de texto libre (dentro de ventana 24hs) — opt-out, opt-in y futuros.';

insert into public.whatsapp_system_templates (key, descripcion, texto)
values
  (
    'opt_out_confirmacion',
    'Respuesta automática cuando un contacto escribe BAJA / STOP / UNSUBSCRIBE.',
    'Listo, te dimos de baja. No vas a recibir más mensajes de nuestra parte. Si querés volver a activarte escribinos ''ACTIVAR''.'
  ),
  (
    'opt_in_confirmacion',
    'Respuesta automática cuando un contacto dado de baja escribe ACTIVAR / ALTA.',
    '¡Perfecto, te reactivamos! Vas a volver a recibir nuestras novedades.'
  )
on conflict (key) do nothing;

alter table public.whatsapp_system_templates enable row level security;

drop policy if exists "whatsapp_system_templates_select_admin" on public.whatsapp_system_templates;
create policy "whatsapp_system_templates_select_admin"
on public.whatsapp_system_templates
for select
to authenticated
using (public.es_admin());

drop policy if exists "whatsapp_system_templates_write_admin" on public.whatsapp_system_templates;
create policy "whatsapp_system_templates_write_admin"
on public.whatsapp_system_templates
for all
to authenticated
using (public.es_admin())
with check (public.es_admin());

-- =========================================================================
-- 3. Contactos
-- =========================================================================
create table if not exists public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default '',
  telefono text not null unique,
  tags text[] not null default '{}'::text[],
  notas text not null default '',
  fecha_creacion timestamptz not null default now(),
  ultimo_mensaje timestamptz,
  opted_out boolean not null default false,
  opted_out_at timestamptz
);

comment on table public.whatsapp_contacts is 'Contactos WhatsApp: teléfono normalizado +598XXXXXXXX, tags libres, flag opt-out.';

create index if not exists whatsapp_contacts_tags_idx on public.whatsapp_contacts using gin (tags);
create index if not exists whatsapp_contacts_telefono_idx on public.whatsapp_contacts (telefono);
create index if not exists whatsapp_contacts_activos_idx on public.whatsapp_contacts (opted_out) where opted_out = false;

alter table public.whatsapp_contacts enable row level security;

drop policy if exists "whatsapp_contacts_all_admin" on public.whatsapp_contacts;
create policy "whatsapp_contacts_all_admin"
on public.whatsapp_contacts
for all
to authenticated
using (public.es_admin())
with check (public.es_admin());

-- =========================================================================
-- 4. Mensajes (in + out + status updates)
-- =========================================================================
do $$ begin
  create type public.whatsapp_direction as enum ('in', 'out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.whatsapp_status as enum ('sent', 'delivered', 'read', 'failed', 'received');
exception when duplicate_object then null; end $$;

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text unique,
  direction public.whatsapp_direction not null,
  from_phone text not null,
  to_phone text not null,
  body text not null default '',
  media_type text,
  media_url text,
  status public.whatsapp_status not null default 'received',
  error text,
  sent_at timestamptz,
  received_at timestamptz not null default now(),
  payload jsonb
);

comment on table public.whatsapp_messages is 'Log de mensajes WhatsApp: entrantes + salientes + updates de estado.';

create index if not exists whatsapp_messages_from_idx on public.whatsapp_messages (from_phone, received_at desc);
create index if not exists whatsapp_messages_to_idx on public.whatsapp_messages (to_phone, received_at desc);

alter table public.whatsapp_messages replica identity full;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.whatsapp_messages';
  end if;
exception when duplicate_object then null; end $$;

alter table public.whatsapp_messages enable row level security;

drop policy if exists "whatsapp_messages_all_admin" on public.whatsapp_messages;
create policy "whatsapp_messages_all_admin"
on public.whatsapp_messages
for all
to authenticated
using (public.es_admin())
with check (public.es_admin());

-- =========================================================================
-- 5. Triggers (notificaciones WooCommerce)
-- =========================================================================
do $$ begin
  create type public.whatsapp_trigger_key as enum ('order_confirmed', 'order_shipped', 'order_delivered');
exception when duplicate_object then null; end $$;

create table if not exists public.whatsapp_triggers (
  trigger_key public.whatsapp_trigger_key primary key,
  enabled boolean not null default false,
  template_name text,
  template_language text not null default 'es',
  variable_mapping jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.whatsapp_triggers is 'Mapeo de eventos Woo a plantillas WhatsApp (enabled/off).';

insert into public.whatsapp_triggers (trigger_key) values
  ('order_confirmed'),
  ('order_shipped'),
  ('order_delivered')
on conflict (trigger_key) do nothing;

alter table public.whatsapp_triggers enable row level security;

drop policy if exists "whatsapp_triggers_all_admin" on public.whatsapp_triggers;
create policy "whatsapp_triggers_all_admin"
on public.whatsapp_triggers
for all
to authenticated
using (public.es_admin())
with check (public.es_admin());

-- =========================================================================
-- 6. Broadcasts + resultados
-- =========================================================================
do $$ begin
  create type public.whatsapp_broadcast_status as enum ('pendiente', 'en_curso', 'completado', 'cancelado');
exception when duplicate_object then null; end $$;

create table if not exists public.whatsapp_broadcasts (
  id uuid primary key default gen_random_uuid(),
  template_name text not null,
  template_language text not null default 'es',
  template_category text,
  total int not null default 0,
  delivered int not null default 0,
  failed int not null default 0,
  skipped int not null default 0,
  status public.whatsapp_broadcast_status not null default 'pendiente',
  next_cursor int not null default 0,
  media_header jsonb,
  template_snapshot jsonb,
  variables_default jsonb,
  coste_estimado_usd numeric(10,4) not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

comment on table public.whatsapp_broadcasts is 'Job de broadcast (template) con progreso chunked.';
comment on column public.whatsapp_broadcasts.template_snapshot is 'Snapshot de template.components de Meta al crear el job (variables nombradas y orden header/body/footer).';

create table if not exists public.whatsapp_broadcast_results (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.whatsapp_broadcasts(id) on delete cascade,
  to_phone text not null,
  contact_id uuid references public.whatsapp_contacts(id) on delete set null,
  variables jsonb,
  ok boolean,
  skipped text,
  wa_message_id text,
  error text,
  sent_at timestamptz
);

comment on table public.whatsapp_broadcast_results is 'Fila por destinatario de un broadcast. skipped=null|opted_out|invalid_phone.';

create index if not exists whatsapp_broadcast_results_broadcast_idx
  on public.whatsapp_broadcast_results (broadcast_id, sent_at);
create index if not exists whatsapp_broadcast_results_pendientes_idx
  on public.whatsapp_broadcast_results (broadcast_id)
  where sent_at is null and skipped is null;

alter table public.whatsapp_broadcasts enable row level security;
alter table public.whatsapp_broadcast_results enable row level security;

drop policy if exists "whatsapp_broadcasts_all_admin" on public.whatsapp_broadcasts;
create policy "whatsapp_broadcasts_all_admin"
on public.whatsapp_broadcasts
for all
to authenticated
using (public.es_admin())
with check (public.es_admin());

drop policy if exists "whatsapp_broadcast_results_all_admin" on public.whatsapp_broadcast_results;
create policy "whatsapp_broadcast_results_all_admin"
on public.whatsapp_broadcast_results
for all
to authenticated
using (public.es_admin())
with check (public.es_admin());

-- =========================================================================
-- 7. Tracking de transiciones de estado Woo (para triggers idempotentes)
-- =========================================================================
create table if not exists public.whatsapp_woo_order_status (
  order_id bigint primary key,
  status text not null,
  updated_at timestamptz not null default now()
);

comment on table public.whatsapp_woo_order_status is 'Última transición conocida de cada pedido Woo — sirve para disparar triggers solo en cambios.';

alter table public.whatsapp_woo_order_status enable row level security;

drop policy if exists "whatsapp_woo_order_status_all_admin" on public.whatsapp_woo_order_status;
create policy "whatsapp_woo_order_status_all_admin"
on public.whatsapp_woo_order_status
for all
to authenticated
using (public.es_admin())
with check (public.es_admin());

-- =========================================================================
-- 8. Triggers SQL: updated_at automático
-- =========================================================================
create or replace function public.set_updated_at_whatsapp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_config_updated on public.whatsapp_config;
create trigger trg_whatsapp_config_updated
before update on public.whatsapp_config
for each row execute function public.set_updated_at_whatsapp();

drop trigger if exists trg_whatsapp_system_templates_updated on public.whatsapp_system_templates;
create trigger trg_whatsapp_system_templates_updated
before update on public.whatsapp_system_templates
for each row execute function public.set_updated_at_whatsapp();

drop trigger if exists trg_whatsapp_triggers_updated on public.whatsapp_triggers;
create trigger trg_whatsapp_triggers_updated
before update on public.whatsapp_triggers
for each row execute function public.set_updated_at_whatsapp();

-- =========================================================================
-- 9. Columna template_snapshot (bases que corrieron fase 10 antes de existir la columna)
-- =========================================================================
alter table public.whatsapp_broadcasts add column if not exists template_snapshot jsonb;
