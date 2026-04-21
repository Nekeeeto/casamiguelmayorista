-- Nuevos triggers Woo → WhatsApp (pickup, fallido, cancelado, on-hold, Wiser, DAC).
-- Requiere schema_phase10_whatsapp_marketing.sql + cart_abandoned si aplica.
--
-- Si el SQL Editor falla al mezclar ALTER TYPE + INSERT en un solo Run, ejecutá:
--   1) Solo el bloque PASO_1
--   2) Luego solo PASO_2

-- ======================== PASO_1 ========================
do $$ begin
  alter type public.whatsapp_trigger_key add value 'order_pickup_ready';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.whatsapp_trigger_key add value 'order_failed';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.whatsapp_trigger_key add value 'order_cancelled';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.whatsapp_trigger_key add value 'order_on_hold';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.whatsapp_trigger_key add value 'wiser_review_request';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.whatsapp_trigger_key add value 'dac_shipping_receipt';
exception when duplicate_object then null; end $$;

-- ======================== PASO_2 ========================
insert into public.whatsapp_triggers (trigger_key) values
  ('order_pickup_ready'),
  ('order_failed'),
  ('order_cancelled'),
  ('order_on_hold'),
  ('wiser_review_request'),
  ('dac_shipping_receipt')
on conflict (trigger_key) do nothing;
