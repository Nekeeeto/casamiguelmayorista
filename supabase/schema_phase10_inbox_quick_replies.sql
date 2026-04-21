alter table public.whatsapp_config add column if not exists inbox_quick_replies jsonb not null default '[]'::jsonb;

comment on column public.whatsapp_config.inbox_quick_replies is 'Lista de textos para respuestas rápidas en bandeja (admin).';
