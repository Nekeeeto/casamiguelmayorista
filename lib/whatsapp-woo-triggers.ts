import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { leerConfigWhatsapp } from "@/lib/whatsapp-config";
import { fetchWooOrderRawById } from "@/lib/woo";
import { normalizarTelefonoWaUruguay, esTelefonoUyValido } from "@/lib/telefono-wa-uruguay";
import { WhatsappCloudApiError, listApprovedTemplates, sendTemplateMessage } from "@/lib/whatsapp-cloud-api";
import {
  construirComponentesTemplateEnvio,
  plantillaRequiereCabeceraMultimedia,
  resolverMediaHeaderEnvio,
} from "@/lib/whatsapp-templates";

export const TRIGGER_KEYS_PEDIDO = [
  "order_confirmed",
  "order_shipped",
  "order_delivered",
  "order_pickup_ready",
  "order_failed",
  "order_cancelled",
  "order_on_hold",
  "wiser_review_request",
  "dac_shipping_receipt",
] as const;

export type TriggerKeyPedido = (typeof TRIGGER_KEYS_PEDIDO)[number];

export type TriggerKey = TriggerKeyPedido | "cart_abandoned";

export const TRIGGER_KEYS_TODOS: TriggerKey[] = [...TRIGGER_KEYS_PEDIDO, "cart_abandoned"];

export function esTriggerPedido(k: TriggerKey): k is TriggerKeyPedido {
  return k !== "cart_abandoned";
}

export type VariableMapping = Record<string, string>;

/** Orden al evaluar listas manuales `woo_status_slugs` (el primero que coincida gana). */
export const TRIGGER_PRIORIDAD_CAMBIO_ESTADO: readonly TriggerKeyPedido[] = [
  "dac_shipping_receipt",
  "wiser_review_request",
  "order_pickup_ready",
  "order_shipped",
  "order_delivered",
  "order_failed",
  "order_cancelled",
  "order_on_hold",
  "order_confirmed",
] as const;

export type FilaTriggerPedidoWoo = {
  trigger_key: TriggerKeyPedido;
  woo_status_slugs: string[] | null;
};

type FilaTrigger = {
  trigger_key: TriggerKey;
  enabled: boolean;
  template_name: string | null;
  template_language: string;
  variable_mapping: VariableMapping;
  template_header_media_url: string | null;
};

export const CAMPOS_PEDIDO_DISPONIBLES = [
  { key: "id", label: "ID del pedido" },
  { key: "number", label: "Número de pedido" },
  { key: "billing.first_name", label: "Nombre cliente" },
  { key: "billing.last_name", label: "Apellido cliente" },
  { key: "billing.phone", label: "Teléfono cliente" },
  { key: "billing.city", label: "Ciudad" },
  { key: "shipping.city", label: "Ciudad de envío" },
  { key: "shipping.address_1", label: "Dirección de envío" },
  { key: "status", label: "Estado" },
  { key: "total", label: "Total" },
  { key: "currency", label: "Moneda" },
  { key: "tracking_number", label: "Código de seguimiento (meta)" },
  { key: "link_seguimiento", label: "Link de seguimiento (meta)" },
] as const;

/** Campos disponibles para mapear variables del template (payload webhook FunnelKit / REST). */
export const CAMPOS_CARRITO_ABANDONADO = [
  { key: "billing.phone", label: "Teléfono (facturación)" },
  { key: "shipping.phone", label: "Teléfono envío" },
  { key: "billing.first_name", label: "Nombre" },
  { key: "billing.last_name", label: "Apellido" },
  { key: "billing.city", label: "Ciudad (facturación)" },
  { key: "shipping.city", label: "Ciudad de envío" },
  { key: "shipping.address_1", label: "Dirección de envío" },
  { key: "total", label: "Total" },
  { key: "currency", label: "Moneda" },
  { key: "cart_url", label: "URL recuperación carrito" },
  { key: "link_seguimiento", label: "Link recuperación (alias)" },
  { key: "status", label: "Estado" },
  { key: "number", label: "Referencia / ID carrito" },
] as const;

function obtenerValorAnidado(obj: unknown, path: string): string {
  const partes = path.split(".");
  let actual: unknown = obj;
  for (const parte of partes) {
    if (actual && typeof actual === "object" && parte in (actual as Record<string, unknown>)) {
      actual = (actual as Record<string, unknown>)[parte];
    } else {
      return "";
    }
  }
  if (actual == null) return "";
  if (typeof actual === "string" || typeof actual === "number" || typeof actual === "boolean") {
    return String(actual);
  }
  return "";
}

function obtenerMetaWoo(orden: Record<string, unknown>, key: string): string {
  const meta = (orden as { meta_data?: Array<{ key?: string; value?: unknown }> }).meta_data ?? [];
  const fila = meta.find((m) => m?.key === key || m?.key === `_${key}`);
  if (!fila) return "";
  const v = fila.value;
  if (typeof v === "string" || typeof v === "number") return String(v);
  return "";
}

export function resolverValorCampo(orden: Record<string, unknown>, key: string): string {
  if (key === "tracking_number" || key === "link_seguimiento") {
    return obtenerMetaWoo(orden, key);
  }
  return obtenerValorAnidado(orden, key);
}

export type ResultadoDisparoTrigger =
  | { ok: true; waMessageId: string | null; telefono: string }
  | { ok: false; motivo: string };

export async function dispararTriggerPedido({
  orderId,
  triggerKey,
}: {
  orderId: number;
  triggerKey: TriggerKeyPedido;
}): Promise<ResultadoDisparoTrigger> {
  const supabase = getSupabaseAdmin();

  const { data: trigger, error: errTrigger } = await supabase
    .from("whatsapp_triggers")
    .select("trigger_key, enabled, template_name, template_language, variable_mapping, template_header_media_url")
    .eq("trigger_key", triggerKey)
    .maybeSingle<FilaTrigger>();

  if (errTrigger) return { ok: false, motivo: `Error leyendo trigger: ${errTrigger.message}` };
  if (!trigger || !trigger.enabled) return { ok: false, motivo: "Trigger deshabilitado." };
  if (!trigger.template_name) return { ok: false, motivo: "Trigger sin template asignado." };

  const orden = await fetchWooOrderRawById(orderId);
  const telefonoRaw =
    obtenerValorAnidado(orden, "billing.phone") ||
    obtenerValorAnidado(orden, "shipping.phone");
  const telefono = normalizarTelefonoWaUruguay(telefonoRaw);
  if (!telefono || !esTelefonoUyValido(telefono)) {
    return { ok: false, motivo: "Teléfono del pedido inválido para Uruguay." };
  }

  const { data: contacto } = await supabase
    .from("whatsapp_contacts")
    .select("id, opted_out")
    .eq("telefono", telefono)
    .maybeSingle<{ id: string; opted_out: boolean }>();
  if (contacto?.opted_out) {
    return { ok: false, motivo: "Contacto dado de baja (opt-out)." };
  }

  const mapping = trigger.variable_mapping ?? {};
  const variables: string[] = [];
  const numeroVars = Object.keys(mapping)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n > 0);
  const total = numeroVars.length > 0 ? Math.max(...numeroVars) : 0;
  for (let i = 1; i <= total; i++) {
    const campo = mapping[String(i)] ?? "";
    variables.push(campo ? resolverValorCampo(orden, campo) : "");
  }

  const configWa = await leerConfigWhatsapp();
  const templates = await listApprovedTemplates(configWa);
  const tpl = templates.find(
    (t) => t.name === trigger.template_name && t.language === trigger.template_language,
  );
  if (!tpl) {
    return { ok: false, motivo: "Template no encontrado en Meta." };
  }
  const media = resolverMediaHeaderEnvio(tpl, trigger.template_header_media_url);
  if (plantillaRequiereCabeceraMultimedia(tpl) && !media) {
    return {
      ok: false,
      motivo:
        "El template tiene cabecera multimedia: configurá «URL cabecera» en el trigger (HTTPS público).",
    };
  }
  const componentes = construirComponentesTemplateEnvio(tpl, variables, media);

  try {
    const resultado = await sendTemplateMessage(
      telefono,
      trigger.template_name,
      trigger.template_language,
      componentes.length > 0 ? componentes : null,
      configWa,
    );
    const waId = resultado.messages?.[0]?.id ?? null;
    if (waId) {
      await supabase.from("whatsapp_messages").upsert(
        {
          wa_message_id: waId,
          direction: "out",
          from_phone: configWa.valores.phone_number_id,
          to_phone: telefono,
          body: `[trigger ${triggerKey}] ${trigger.template_name}`,
          status: "sent",
          sent_at: new Date().toISOString(),
          payload: { triggerKey, orderId, variables },
        },
        { onConflict: "wa_message_id" },
      );
    }
    return { ok: true, waMessageId: waId, telefono };
  } catch (error) {
    const mensaje = error instanceof WhatsappCloudApiError ? error.message : error instanceof Error ? error.message : String(error);
    return { ok: false, motivo: mensaje };
  }
}

function strPrimero(raw: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = raw[k];
    if (v == null || v === "") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  }
  return "";
}

/**
 * Convierte el JSON del webhook (FunnelKit u otro) en forma compatible con resolverValorCampo.
 */
export function normalizarPayloadCarritoAbandonado(raw: Record<string, unknown>): Record<string, unknown> {
  const nestedBill =
    raw.billing && typeof raw.billing === "object" ? (raw.billing as Record<string, unknown>) : {};
  const nestedShip =
    raw.shipping && typeof raw.shipping === "object" ? (raw.shipping as Record<string, unknown>) : {};
  const nestedContact =
    raw.contact && typeof raw.contact === "object" ? (raw.contact as Record<string, unknown>) : {};

  const phone = strPrimero(raw, [
    "phone",
    "billing_phone",
    "telephone",
    "user_phone",
    "wc_billing_phone",
    "customer_phone",
  ]) || strPrimero(nestedBill, ["phone"]) || strPrimero(nestedContact, ["phone"]);

  const firstName =
    strPrimero(raw, ["first_name", "firstname", "billing_first_name"]) ||
    strPrimero(nestedBill, ["first_name"]) ||
    strPrimero(nestedContact, ["first_name"]);

  const lastName =
    strPrimero(raw, ["last_name", "lastname", "billing_last_name"]) ||
    strPrimero(nestedBill, ["last_name"]) ||
    strPrimero(nestedContact, ["last_name"]);

  const urlRecuperacion = strPrimero(raw, [
    "cart_url",
    "recovery_url",
    "checkout_url",
    "cart_recovery_url",
    "abandoned_checkout_url",
    "recovery_link",
    "link",
  ]);

  const total = strPrimero(raw, ["total", "cart_total", "amount", "subtotal"]);
  const currency = strPrimero(raw, ["currency", "cart_currency"]);
  const ref = strPrimero(raw, ["cart_id", "id", "checkout_id", "number"]);

  return {
    id: ref ? Number(ref) || 0 : 0,
    number: ref,
    status: strPrimero(raw, ["status"]) || "abandoned",
    total,
    currency,
    billing: {
      first_name: firstName,
      last_name: lastName,
      phone: phone || strPrimero(nestedBill, ["phone"]),
      city: strPrimero(nestedBill, ["city"]) || strPrimero(raw, ["city"]),
    },
    shipping: {
      city: strPrimero(nestedShip, ["city"]) || strPrimero(raw, ["shipping_city"]),
      address_1: strPrimero(nestedShip, ["address_1"]),
      phone: strPrimero(nestedShip, ["phone"]) || strPrimero(raw, ["shipping_phone"]),
    },
    tracking_number: "",
    link_seguimiento: urlRecuperacion,
    cart_url: urlRecuperacion,
  };
}

export async function dispararTriggerCarritoAbandonado({
  payload,
}: {
  payload: Record<string, unknown>;
}): Promise<ResultadoDisparoTrigger> {
  const triggerKey: TriggerKey = "cart_abandoned";
  const supabase = getSupabaseAdmin();

  const { data: trigger, error: errTrigger } = await supabase
    .from("whatsapp_triggers")
    .select("trigger_key, enabled, template_name, template_language, variable_mapping, template_header_media_url")
    .eq("trigger_key", triggerKey)
    .maybeSingle<FilaTrigger>();

  if (errTrigger) return { ok: false, motivo: `Error leyendo trigger: ${errTrigger.message}` };
  if (!trigger || !trigger.enabled) return { ok: false, motivo: "Trigger deshabilitado." };
  if (!trigger.template_name) return { ok: false, motivo: "Trigger sin template asignado." };

  const orden = normalizarPayloadCarritoAbandonado(payload);
  const telefonoRaw =
    resolverValorCampo(orden, "billing.phone") || resolverValorCampo(orden, "shipping.phone") || "";
  const telefono = normalizarTelefonoWaUruguay(telefonoRaw);
  if (!telefono || !esTelefonoUyValido(telefono)) {
    return { ok: false, motivo: "Teléfono inválido para Uruguay (revisá el payload / mapeo)." };
  }

  const { data: contacto } = await supabase
    .from("whatsapp_contacts")
    .select("id, opted_out")
    .eq("telefono", telefono)
    .maybeSingle<{ id: string; opted_out: boolean }>();
  if (contacto?.opted_out) {
    return { ok: false, motivo: "Contacto dado de baja (opt-out)." };
  }

  const mapping = trigger.variable_mapping ?? {};
  const variables: string[] = [];
  const numeroVars = Object.keys(mapping)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n > 0);
  const totalVars = numeroVars.length > 0 ? Math.max(...numeroVars) : 0;
  for (let i = 1; i <= totalVars; i++) {
    const campo = mapping[String(i)] ?? "";
    variables.push(campo ? resolverValorCampo(orden, campo) : "");
  }

  const configWa = await leerConfigWhatsapp();
  const templates = await listApprovedTemplates(configWa);
  const tpl = templates.find(
    (t) => t.name === trigger.template_name && t.language === trigger.template_language,
  );
  if (!tpl) {
    return { ok: false, motivo: "Template no encontrado en Meta." };
  }
  const media = resolverMediaHeaderEnvio(tpl, trigger.template_header_media_url);
  if (plantillaRequiereCabeceraMultimedia(tpl) && !media) {
    return {
      ok: false,
      motivo:
        "El template tiene cabecera multimedia: configurá «URL cabecera» en el trigger (HTTPS público).",
    };
  }
  const componentes = construirComponentesTemplateEnvio(tpl, variables, media);

  try {
    const resultado = await sendTemplateMessage(
      telefono,
      trigger.template_name,
      trigger.template_language,
      componentes.length > 0 ? componentes : null,
      configWa,
    );
    const waId = resultado.messages?.[0]?.id ?? null;
    if (waId) {
      await supabase.from("whatsapp_messages").upsert(
        {
          wa_message_id: waId,
          direction: "out",
          from_phone: configWa.valores.phone_number_id,
          to_phone: telefono,
          body: `[trigger ${triggerKey}] ${trigger.template_name}`,
          status: "sent",
          sent_at: new Date().toISOString(),
          payload: { triggerKey, cartPayload: payload, variables },
        },
        { onConflict: "wa_message_id" },
      );
    }
    return { ok: true, waMessageId: waId, telefono };
  } catch (error) {
    const mensaje = error instanceof WhatsappCloudApiError ? error.message : error instanceof Error ? error.message : String(error);
    return { ok: false, motivo: mensaje };
  }
}

/**
 * Mapea una transición de estado Woo a un trigger, si corresponde.
 */
export function triggerDesdeEstadoWoo(
  nuevoEstado: string | undefined,
  estadoAnterior: string | undefined,
): TriggerKeyPedido | null {
  const nuevo = (nuevoEstado ?? "").toLowerCase();
  const anterior = (estadoAnterior ?? "").toLowerCase();
  if (!nuevo || nuevo === anterior) return null;

  if (nuevo === "processing" && anterior !== "processing") return "order_confirmed";
  if (nuevo === "on-hold") return "order_on_hold";
  if (nuevo === "failed") return "order_failed";
  if (nuevo === "cancelled" || nuevo === "canceled") return "order_cancelled";
  if (nuevo === "completed") return "order_delivered";
  if (nuevo.includes("para-retirar")) return "order_pickup_ready";
  if (nuevo.includes("enviado-dac")) return "dac_shipping_receipt";
  if (nuevo.includes("wiser")) return "wiser_review_request";
  if (/(shipped|enviado|envio)/.test(nuevo)) return "order_shipped";
  return null;
}

function normalizarSlugEstadoWebhook(slug: string): string {
  return slug.trim().toLowerCase().replace(/^wc-/, "");
}

/**
 * Si varias filas tienen el mismo slug en `woo_status_slugs`, gana la primera según `TRIGGER_PRIORIDAD_CAMBIO_ESTADO`.
 * Si una fila tiene `woo_status_slugs` vacío, solo aplica la regla legacy cuando `triggerDesdeEstadoWoo` devuelve esa key.
 */
export function resolverTriggerKeyParaEstadoWoo(
  nuevoEstado: string | undefined,
  estadoAnterior: string | undefined,
  filas: ReadonlyArray<FilaTriggerPedidoWoo>,
): TriggerKeyPedido | null {
  const n = normalizarSlugEstadoWebhook(nuevoEstado ?? "");
  const a = normalizarSlugEstadoWebhook(estadoAnterior ?? "");
  if (!n || n === a) return null;

  const porKey = new Map(filas.map((f) => [f.trigger_key, f]));

  for (const key of TRIGGER_PRIORIDAD_CAMBIO_ESTADO) {
    const row = porKey.get(key);
    const slugs = (row?.woo_status_slugs ?? [])
      .map((s) => normalizarSlugEstadoWebhook(String(s)))
      .filter(Boolean);
    if (slugs.length > 0 && slugs.includes(n)) return key;
  }

  const legacy = triggerDesdeEstadoWoo(nuevoEstado, estadoAnterior);
  if (!legacy) return null;
  const legacySlugs = (porKey.get(legacy)?.woo_status_slugs ?? [])
    .map((s) => normalizarSlugEstadoWebhook(String(s)))
    .filter(Boolean);
  if (legacySlugs.length === 0) return legacy;
  return null;
}
