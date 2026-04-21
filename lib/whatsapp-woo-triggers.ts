import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { leerConfigWhatsapp } from "@/lib/whatsapp-config";
import { fetchWooOrderRawById } from "@/lib/woo";
import { normalizarTelefonoWaUruguay, esTelefonoUyValido } from "@/lib/telefono-wa-uruguay";
import { WhatsappCloudApiError, listApprovedTemplates, sendTemplateMessage } from "@/lib/whatsapp-cloud-api";
import {
  construirComponentesTemplateEnvio,
  construirValoresTemplateCompleto,
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

/** Slug de estado de pedido Woo (REST / webhook): minúsculas, sin prefijo `wc-`. */
export function normalizarSlugEstadoWebhook(slug: string): string {
  return slug.trim().toLowerCase().replace(/^wc-/, "");
}

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

/** Campos para mapear variables del template cuando el disparo es el webhook WiserReview (JSON docs). */
export const CAMPOS_REVIEW_WEBHOOK = [
  { key: "customer_first_name", label: "Primer nombre (desde customer_name Wiser)" },
  { key: "customer_name", label: "Nombre completo (Wiser)" },
  { key: "customer_number", label: "Teléfono (customer_number Wiser)" },
  { key: "customer_email", label: "Email (Wiser)" },
  { key: "product_name", label: "Nombre producto (Wiser)" },
  { key: "product_id", label: "ID producto (Wiser)" },
  { key: "product_image", label: "Imagen producto URL (Wiser)" },
  { key: "product_review_url", label: "Link reseña producto (Wiser)" },
  { key: "brand_product_review_url", label: "Link reseña marca (Wiser)" },
  { key: "review_url", label: "Link reseña (prioridad: producto → marca)" },
  { key: "event_type", label: "Tipo de evento (Wiser)" },
  { key: "discount_code", label: "Código descuento (Wiser)" },
  { key: "discount_value", label: "Valor descuento (Wiser)" },
  ...CAMPOS_PEDIDO_DISPONIBLES,
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
  const armado = construirValoresTemplateCompleto(tpl.components ?? [], mapping, (campo) =>
    resolverValorCampo(orden, campo),
  );
  if (armado.error) return { ok: false, motivo: armado.error };
  const variables = armado.valores;
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

function primerTokenNombre(nombreCompleto: string): string {
  const t = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  return t[0] ?? "";
}

function restoNombre(nombreCompleto: string): string {
  const t = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  return t.length > 1 ? t.slice(1).join(" ") : "";
}

/**
 * JSON de WiserReview (Webhook Alert) y variantes genéricas.
 * @see https://wiserreview.com/docs/integration/webhook-alert-for-request-trigger-used-for-get-event-alert/
 */
export function normalizarPayloadWiserReview(raw: Record<string, unknown>): Record<string, unknown> {
  const nestedBill =
    raw.billing && typeof raw.billing === "object" ? (raw.billing as Record<string, unknown>) : {};
  const nestedShip =
    raw.shipping && typeof raw.shipping === "object" ? (raw.shipping as Record<string, unknown>) : {};

  const phone =
    strPrimero(raw, [
      "customer_number",
      "CustomerNumber",
      "phone",
      "Phone",
      "billing_phone",
      "customer_phone",
      "mobile",
      "telephone",
      "user_phone",
      "wc_billing_phone",
    ]) ||
    strPrimero(nestedBill, ["phone"]) ||
    "";

  const customerNameWiser = strPrimero(raw, ["customer_name", "CustomerName"]);
  const firstFromWiserName = customerNameWiser ? primerTokenNombre(customerNameWiser) : "";
  const lastFromWiserName = customerNameWiser ? restoNombre(customerNameWiser) : "";

  const firstName =
    firstFromWiserName ||
    strPrimero(raw, ["first_name", "firstname", "billing_first_name"]) ||
    strPrimero(nestedBill, ["first_name"]);

  const lastName =
    lastFromWiserName ||
    strPrimero(raw, ["last_name", "lastname", "billing_last_name"]) ||
    strPrimero(nestedBill, ["last_name"]);

  const orderIdStr = strPrimero(raw, ["order_id", "OrderId", "orderId", "wc_order_id", "order_number", "id"]);
  const orderIdNum = orderIdStr ? Number(orderIdStr) : 0;
  const numberStr = strPrimero(raw, ["order_number", "number"]) || (orderIdNum > 0 ? String(orderIdNum) : "");

  const productReviewUrl = strPrimero(raw, ["product_review_url", "ProductReviewUrl"]);
  const brandReviewUrl = strPrimero(raw, ["brand_product_review_url", "BrandProductReviewUrl"]);
  const reviewUrl =
    productReviewUrl ||
    brandReviewUrl ||
    strPrimero(raw, [
      "review_url",
      "review_link",
      "reviewLink",
      "feedback_url",
      "link",
      "url",
      "whatsapp_message",
      "message_link",
    ]);

  const productName = strPrimero(raw, ["product_name", "ProductName", "product", "item_name", "product_title"]);
  const productId = strPrimero(raw, ["product_id", "ProductId"]);
  const productImage = strPrimero(raw, ["product_image", "ProductImage"]);
  const customerEmail = strPrimero(raw, ["customer_email", "CustomerEmail"]);
  const eventType = strPrimero(raw, ["event_type", "EventType"]);
  const discountCode = strPrimero(raw, ["discount_code", "DiscountCode"]);
  const discountValue = strPrimero(raw, ["discount_value", "DiscountValue"]);

  const total = strPrimero(raw, ["total", "order_total", "amount"]);
  const currency = strPrimero(raw, ["currency"]) || "UYU";

  const customerFirstName = firstFromWiserName || firstName;

  return {
    id: Number.isFinite(orderIdNum) && orderIdNum > 0 ? orderIdNum : 0,
    number: numberStr,
    status: strPrimero(raw, ["status"]) || "review_request",
    total,
    currency,
    billing: {
      first_name: firstName,
      last_name: lastName,
      phone: phone || strPrimero(nestedBill, ["phone"]),
      city: strPrimero(nestedBill, ["city"]) || strPrimero(raw, ["city"]),
    },
    shipping: {
      city: strPrimero(nestedShip, ["city"]),
      address_1: strPrimero(nestedShip, ["address_1"]),
      phone: strPrimero(nestedShip, ["phone"]),
    },
    customer_first_name: customerFirstName,
    customer_name: customerNameWiser,
    customer_number: phone,
    customer_email: customerEmail,
    event_type: eventType,
    product_id: productId,
    product_name: productName,
    product_image: productImage,
    product_review_url: productReviewUrl,
    brand_product_review_url: brandReviewUrl,
    discount_code: discountCode,
    discount_value: discountValue,
    review_url: reviewUrl,
  };
}

const CAMPOS_RAIZ_WISER_EN_MERGE: readonly string[] = [
  "customer_first_name",
  "customer_name",
  "customer_number",
  "customer_email",
  "event_type",
  "product_id",
  "product_name",
  "product_image",
  "product_review_url",
  "brand_product_review_url",
  "discount_code",
  "discount_value",
  "review_url",
];

function mezclarWooConNormReview(woo: Record<string, unknown>, norm: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...woo } as Record<string, unknown>;
  const wb =
    typeof woo.billing === "object" && woo.billing !== null
      ? { ...(woo.billing as Record<string, unknown>) }
      : ({} as Record<string, unknown>);
  const nb = norm.billing as Record<string, unknown> | undefined;
  if (nb?.phone && String(nb.phone).trim()) wb.phone = nb.phone;
  if (nb?.first_name && String(nb.first_name).trim()) wb.first_name = nb.first_name;
  if (nb?.last_name && String(nb.last_name).trim()) wb.last_name = nb.last_name;
  merged.billing = wb;
  for (const key of CAMPOS_RAIZ_WISER_EN_MERGE) {
    const v = norm[key];
    if (v == null || v === "") continue;
    if (typeof v === "string" && v.trim()) merged[key] = v.trim();
    else if (typeof v === "number" && Number.isFinite(v)) merged[key] = String(v);
    else if (typeof v === "boolean") merged[key] = String(v);
  }
  return merged;
}

async function ordenParaTriggerWiserReview(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const norm = normalizarPayloadWiserReview(payload);
  const oid = typeof norm.id === "number" ? norm.id : Number(norm.id) || 0;
  if (oid > 0) {
    try {
      const woo = await fetchWooOrderRawById(oid);
      return mezclarWooConNormReview(woo, norm);
    } catch {
      return norm;
    }
  }
  return norm;
}

export async function dispararTriggerWiserReviewWebhook({
  payload,
}: {
  payload: Record<string, unknown>;
}): Promise<ResultadoDisparoTrigger> {
  const triggerKey: TriggerKeyPedido = "wiser_review_request";
  const supabase = getSupabaseAdmin();

  const { data: trigger, error: errTrigger } = await supabase
    .from("whatsapp_triggers")
    .select("trigger_key, enabled, template_name, template_language, variable_mapping, template_header_media_url")
    .eq("trigger_key", triggerKey)
    .maybeSingle<FilaTrigger>();

  if (errTrigger) return { ok: false, motivo: `Error leyendo trigger: ${errTrigger.message}` };
  if (!trigger || !trigger.enabled) return { ok: false, motivo: "Trigger deshabilitado." };
  if (!trigger.template_name) return { ok: false, motivo: "Trigger sin template asignado." };

  const orden = await ordenParaTriggerWiserReview(payload);
  const telefonoRaw =
    resolverValorCampo(orden, "billing.phone") || resolverValorCampo(orden, "shipping.phone") || "";
  const telefono = normalizarTelefonoWaUruguay(telefonoRaw);
  if (!telefono || !esTelefonoUyValido(telefono)) {
    return { ok: false, motivo: "Teléfono inválido para Uruguay (revisá el JSON del webhook o order_id + billing.phone en Woo)." };
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
  const armado = construirValoresTemplateCompleto(tpl.components ?? [], mapping, (campo) =>
    resolverValorCampo(orden, campo),
  );
  if (armado.error) return { ok: false, motivo: armado.error };
  const variables = armado.valores;
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
          payload: { triggerKey, wiserPayload: payload, variables },
        },
        { onConflict: "wa_message_id" },
      );
    }
    return { ok: true, waMessageId: waId, telefono };
  } catch (error) {
    const mensaje =
      error instanceof WhatsappCloudApiError ? error.message : error instanceof Error ? error.message : String(error);
    return { ok: false, motivo: mensaje };
  }
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
  const armado = construirValoresTemplateCompleto(tpl.components ?? [], mapping, (campo) =>
    resolverValorCampo(orden, campo),
  );
  if (armado.error) return { ok: false, motivo: armado.error };
  const variables = armado.valores;
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
  const nuevo = normalizarSlugEstadoWebhook(nuevoEstado ?? "");
  const anterior = normalizarSlugEstadoWebhook(estadoAnterior ?? "");
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
