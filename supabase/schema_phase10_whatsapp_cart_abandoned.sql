-- Carrito abandonado (FunnelKit) → trigger WhatsApp cart_abandoned
-- Requiere schema_phase10_whatsapp_marketing.sql ya aplicado.
--
-- IMPORTANTE (Postgres 55P04): no podés agregar un valor al enum y usarlo en el mismo Run.
-- Hacé DOS ejecuciones separadas en el SQL Editor:
--   1) Seleccioná SOLO el bloque "PASO 1" y Run.
--   2) En otra ejecución, seleccioná SOLO el bloque "PASO 2" y Run.
-- Si el PASO 1 ya corrió antes, el enum existe: saltá al PASO 2.

-- ======================== PASO 1 — Run solo este bloque ========================
do $$
begin
  alter type public.whatsapp_trigger_key add value 'cart_abandoned';
exception
  when duplicate_object then null;
end $$;

-- ======================== PASO 2 — Run solo este bloque (después del PASO 1) ========================
insert into public.whatsapp_triggers (trigger_key) values ('cart_abandoned')
on conflict (trigger_key) do nothing;
