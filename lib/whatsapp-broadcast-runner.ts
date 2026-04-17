import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { leerConfigWhatsapp } from "@/lib/whatsapp-config";
import {
  WhatsappCloudApiError,
  sendTemplateMessage,
  type WhatsappSendComponent,
  type WhatsappSendParameter,
  type WhatsappTemplateComponent,
} from "@/lib/whatsapp-cloud-api";
import { construirComponentesTemplateEnvio } from "@/lib/whatsapp-templates";

const DELAY_MS_ENTRE_ENVIOS = 1100;
const CHUNK_DEFAULT = 50;

type FilaBroadcast = {
  id: string;
  template_name: string;
  template_language: string;
  status: "pendiente" | "en_curso" | "completado" | "cancelado";
  next_cursor: number;
  total: number;
  delivered: number;
  failed: number;
  skipped: number;
  media_header: { tipo: "image" | "video" | "document"; link: string; filename?: string } | null;
  template_snapshot: { components: WhatsappTemplateComponent[] } | null;
};

type FilaPendiente = {
  id: string;
  to_phone: string;
  variables: unknown;
};

function variablesDesdeJsonb(val: unknown): string[] | null {
  if (val == null) return null;
  if (!Array.isArray(val)) return null;
  const out: string[] = [];
  for (const item of val) {
    if (typeof item === "string") out.push(item);
    else if (typeof item === "number" || typeof item === "boolean") out.push(String(item));
    else return null;
  }
  return out;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildComponents(
  mediaHeader: FilaBroadcast["media_header"],
  variables: string[] | null,
): WhatsappSendComponent[] {
  const componentes: WhatsappSendComponent[] = [];
  if (mediaHeader) {
    let parametro: WhatsappSendParameter;
    if (mediaHeader.tipo === "image") {
      parametro = { type: "image", image: { link: mediaHeader.link } };
    } else if (mediaHeader.tipo === "video") {
      parametro = { type: "video", video: { link: mediaHeader.link } };
    } else {
      parametro = {
        type: "document",
        document: { link: mediaHeader.link, filename: mediaHeader.filename ?? "adjunto" },
      };
    }
    componentes.push({ type: "header", parameters: [parametro] });
  }
  if (variables && variables.length > 0) {
    componentes.push({
      type: "body",
      parameters: variables.map<WhatsappSendParameter>((v) => ({ type: "text", text: v })),
    });
  }
  return componentes;
}

function componentesParaEnvio(
  broadcast: FilaBroadcast,
  variables: string[] | null,
): WhatsappSendComponent[] {
  const snap = broadcast.template_snapshot?.components;
  if (Array.isArray(snap)) {
    return construirComponentesTemplateEnvio({ components: snap }, variables ?? [], broadcast.media_header);
  }
  return buildComponents(broadcast.media_header, variables);
}

export async function ejecutarChunk(broadcastId: string, tamanoChunk = CHUNK_DEFAULT): Promise<{
  processed: number;
  remaining: number;
  status: FilaBroadcast["status"];
}> {
  const supabase = getSupabaseAdmin();
  const config = await leerConfigWhatsapp();

  const { data: broadcast, error: errBroadcast } = await supabase
    .from("whatsapp_broadcasts")
    .select(
      "id, template_name, template_language, status, next_cursor, total, delivered, failed, skipped, media_header, template_snapshot",
    )
    .eq("id", broadcastId)
    .maybeSingle<FilaBroadcast>();
  if (errBroadcast || !broadcast) {
    throw new Error(`Broadcast ${broadcastId} no encontrado: ${errBroadcast?.message ?? "desconocido"}`);
  }

  if (broadcast.status === "cancelado" || broadcast.status === "completado") {
    const { count } = await supabase
      .from("whatsapp_broadcast_results")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcastId)
      .is("sent_at", null)
      .is("skipped", null);
    return { processed: 0, remaining: count ?? 0, status: broadcast.status };
  }

  if (broadcast.status === "pendiente") {
    await supabase
      .from("whatsapp_broadcasts")
      .update({ status: "en_curso" })
      .eq("id", broadcastId);
  }

  const { data: pendientes, error: errPendientes } = await supabase
    .from("whatsapp_broadcast_results")
    .select("id, to_phone, variables")
    .eq("broadcast_id", broadcastId)
    .is("sent_at", null)
    .is("skipped", null)
    .order("id", { ascending: true })
    .limit(tamanoChunk);
  if (errPendientes) {
    throw new Error(`No se pudieron leer pendientes: ${errPendientes.message}`);
  }

  let delivered = broadcast.delivered;
  let failed = broadcast.failed;
  let processed = 0;

  for (const fila of (pendientes ?? []) as FilaPendiente[]) {
    try {
      const vars = variablesDesdeJsonb(fila.variables);
      const componentes = componentesParaEnvio(broadcast, vars);
      const resultado = await sendTemplateMessage(
        fila.to_phone,
        broadcast.template_name,
        broadcast.template_language,
        componentes.length > 0 ? componentes : null,
        config,
      );
      const waId = resultado.messages?.[0]?.id ?? null;
      await supabase
        .from("whatsapp_broadcast_results")
        .update({ ok: true, wa_message_id: waId, sent_at: new Date().toISOString() })
        .eq("id", fila.id);
      if (waId) {
        await supabase.from("whatsapp_messages").upsert(
          {
            wa_message_id: waId,
            direction: "out",
            from_phone: config.valores.phone_number_id,
            to_phone: fila.to_phone,
            body: `[template] ${broadcast.template_name}`,
            status: "sent",
            sent_at: new Date().toISOString(),
          },
          { onConflict: "wa_message_id" },
        );
      }
      delivered += 1;
    } catch (error) {
      const mensaje = error instanceof WhatsappCloudApiError ? error.message : error instanceof Error ? error.message : String(error);
      await supabase
        .from("whatsapp_broadcast_results")
        .update({ ok: false, error: mensaje, sent_at: new Date().toISOString() })
        .eq("id", fila.id);
      failed += 1;
    }
    processed += 1;
    if (processed < (pendientes?.length ?? 0)) {
      await esperar(DELAY_MS_ENTRE_ENVIOS);
    }
  }

  const { count: remainingCount } = await supabase
    .from("whatsapp_broadcast_results")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .is("sent_at", null)
    .is("skipped", null);

  const remaining = remainingCount ?? 0;
  const nuevoStatus: FilaBroadcast["status"] = remaining === 0 ? "completado" : "en_curso";

  await supabase
    .from("whatsapp_broadcasts")
    .update({
      delivered,
      failed,
      next_cursor: broadcast.next_cursor + processed,
      status: nuevoStatus,
    })
    .eq("id", broadcastId);

  return { processed, remaining, status: nuevoStatus };
}
