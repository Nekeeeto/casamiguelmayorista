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

export type TriggerKey = "order_confirmed" | "order_shipped" | "order_delivered" | "cart_abandoned";

export type VariableMapping = Record<string, string>;

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
  triggerKey: TriggerKey;
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
export function triggerDesdeEstadoWoo(nuevoEstado: string | undefined, estadoAnterior: string | undefined): TriggerKey | null {
  const nuevo = (nuevoEstado ?? "").toLowerCase();
  const anterior = (estadoAnterior ?? "").toLowerCase();
  if (nuevo === "processing" && anterior !== "processing") return "order_confirmed";
  if (nuevo === "completed" && anterior !== "completed") return "order_delivered";
  if (/(shipped|enviado|envio|para-retirar)/.test(nuevo) && nuevo !== anterior) return "order_shipped";
  return null;
}
