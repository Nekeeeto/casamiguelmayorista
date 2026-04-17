-- URL pública HTTPS para cabecera IMAGE/VIDEO/DOCUMENT al enviar templates (Meta API).
alter table public.whatsapp_triggers
  add column if not exists template_header_media_url text;

comment on column public.whatsapp_triggers.template_header_media_url is
  'Link HTTPS accesible para header multimedia del template; obligatorio si la plantilla Meta tiene cabecera imagen/video/documento.';
