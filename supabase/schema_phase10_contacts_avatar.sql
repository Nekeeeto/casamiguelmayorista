alter table public.whatsapp_contacts add column if not exists avatar_url text;

comment on column public.whatsapp_contacts.avatar_url is 'URL pública opcional (foto no viene de Cloud API); si null, UI usa iniciales.';
