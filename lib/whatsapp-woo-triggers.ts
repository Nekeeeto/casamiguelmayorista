import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { leerConfigWhatsapp } from "@/lib/whatsapp-config";
import { fetchWooOrderRawById } from "@/lib/woo";
import { normalizarTelefonoWaUruguay, esTelefonoUyValido } from "@/lib/telefono-wa-uruguay";
import { WhatsappCloudApiError, listApprovedTemplates, sendTemplateMessage } from "@/lib/whatsapp-cloud-api";
import { construirComponentesTemplateEnvio } from "@/lib/whatsapp-templates";

export type TriggerKey = "order_confirmed" | "order_shipped" | "order_delivered";

export type VariableMapping = Record<string, string>;

type FilaTrigger = {
  trigger_key: TriggerKey;
  enabled: boolean;
  template_name: string | null;
  template_language: string;
  variable_mapping: VariableMapping;
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
    .select("trigger_key, enabled, template_name, template_language, variable_mapping")
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
  const componentes = construirComponentesTemplateEnvio(tpl, variables, null);

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
