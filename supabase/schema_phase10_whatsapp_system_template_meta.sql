-- Plantilla Meta opcional para respuestas automáticas opt-in / opt-out (además de texto libre).

alter table public.whatsapp_system_templates
  add column if not exists reply_mode text not null default 'text'
    check (reply_mode in ('text', 'template'));

alter table public.whatsapp_system_templates
  add column if not exists template_name text;

alter table public.whatsapp_system_templates
  add column if not exists template_language text;

alter table public.whatsapp_system_templates
  add column if not exists template_parameters jsonb not null default '[]'::jsonb;

comment on column public.whatsapp_system_templates.reply_mode is 'text = mensaje libre (ventana 24h); template = plantilla Meta aprobada (envío como template).';
comment on column public.whatsapp_system_templates.template_parameters is 'Valores para variables {{n}} en orden header+body (JSON array de strings).';
