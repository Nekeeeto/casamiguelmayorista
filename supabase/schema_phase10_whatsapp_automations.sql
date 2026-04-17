-- Keywords editables + flags de automatización (saludo / delay).

alter table public.whatsapp_config
  add column if not exists keywords_opt_out text;

alter table public.whatsapp_config
  add column if not exists keywords_opt_in text;

alter table public.whatsapp_config
  add column if not exists automation_greeting_enabled boolean not null default true;

alter table public.whatsapp_config
  add column if not exists automation_delay_enabled boolean not null default false;

update public.whatsapp_config
set keywords_opt_out = coalesce(nullif(trim(keywords_opt_out), ''), 'BAJA,STOP,UNSUBSCRIBE,CANCELAR,DESUSCRIBIR')
where id = 1;

update public.whatsapp_config
set keywords_opt_in = coalesce(nullif(trim(keywords_opt_in), ''), 'ACTIVAR,ALTA,SUBSCRIBE,START')
where id = 1;

insert into public.whatsapp_system_templates (key, descripcion, texto)
values
  (
    'greeting_auto',
    'Saludo automático al primer mensaje de un contacto (si no coincide con baja/alta).',
    '¡Hola! Gracias por escribirnos. En breve te respondemos.'
  ),
  (
    'delay_auto',
    'Mensaje si el equipo tarda en responder (la lógica de “delay” aún no está activa en el webhook).',
    'Seguimos atendiendo tu mensaje, en un momento te escribimos.'
  )
on conflict (key) do nothing;
