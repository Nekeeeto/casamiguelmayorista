-- Estados Woo por trigger (lista manual); vacío = reglas por defecto en código.
alter table public.whatsapp_triggers
  add column if not exists woo_status_slugs text[] not null default '{}'::text[];

comment on column public.whatsapp_triggers.woo_status_slugs is
  'Slugs de estado de pedido Woo (match exacto, minúsculas). Vacío = disparo según triggerDesdeEstadoWoo en lib.';
