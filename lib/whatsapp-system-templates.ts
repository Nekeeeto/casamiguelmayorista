import type { WhatsappConfigResuelto } from "@/lib/whatsapp-config";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { listApprovedTemplates, sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp-cloud-api";
import { construirComponentesTemplateEnvio } from "@/lib/whatsapp-templates";

export type SystemTemplateKey =
  | "opt_out_confirmacion"
  | "opt_in_confirmacion"
  | "greeting_auto"
  | "delay_auto";

export type SystemTemplateReplyMode = "text" | "template";

export type SystemTemplateFila = {
  key: string;
  descripcion: string;
  texto: string;
  reply_mode: SystemTemplateReplyMode;
  template_name: string | null;
  template_language: string | null;
  template_parameters: string[];
  updated_at: string;
};

function filaDesdeRow(row: {
  key: string;
  descripcion: string;
  texto: string;
  reply_mode?: string | null;
  template_name?: string | null;
  template_language?: string | null;
  template_parameters?: unknown;
  updated_at: string;
}): SystemTemplateFila {
  const mode: SystemTemplateReplyMode = row.reply_mode === "template" ? "template" : "text";
  const params = normalizarParametros(row.template_parameters);
  return {
    key: row.key,
    descripcion: row.descripcion,
    texto: row.texto,
    reply_mode: mode,
    template_name: row.template_name ?? null,
    template_language: row.template_language ?? null,
    template_parameters: params,
    updated_at: row.updated_at,
  };
}

function normalizarParametros(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => (typeof x === "string" ? x : String(x ?? "")));
}

export async function listarSystemTemplates(): Promise<SystemTemplateFila[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_system_templates")
    .select("key, descripcion, texto, reply_mode, template_name, template_language, template_parameters, updated_at")
    .order("key");
  if (error) throw new Error(`No se pudo leer whatsapp_system_templates: ${error.message}`);
  return (data ?? []).map((row) => filaDesdeRow(row as Parameters<typeof filaDesdeRow>[0]));
}

export async function leerSystemTemplate(key: SystemTemplateKey): Promise<SystemTemplateFila | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_system_templates")
    .select("key, descripcion, texto, reply_mode, template_name, template_language, template_parameters, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer system template ${key}: ${error.message}`);
  if (!data) return null;
  return filaDesdeRow(data as Parameters<typeof filaDesdeRow>[0]);
}

export type PatchSystemTemplate = {
  texto: string;
  reply_mode: SystemTemplateReplyMode;
  template_name: string | null;
  template_language: string | null;
  template_parameters: string[];
};

export async function actualizarSystemTemplate(key: SystemTemplateKey, patch: PatchSystemTemplate): Promise<void> {
  if (patch.texto.length > 1024) {
    throw new Error("El texto del template del sistema no puede superar 1024 caracteres.");
  }
  if (patch.reply_mode === "text" && !patch.texto.trim()) {
    throw new Error("En modo texto libre, el mensaje no puede estar vacío.");
  }
  if (patch.reply_mode === "template") {
    if (!patch.template_name?.trim() || !patch.template_language?.trim()) {
      throw new Error("En modo plantilla Meta, elegí nombre e idioma.");
    }
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("whatsapp_system_templates")
    .update({
      texto: patch.texto,
      reply_mode: patch.reply_mode,
      template_name: patch.reply_mode === "template" ? patch.template_name?.trim() ?? null : null,
      template_language: patch.reply_mode === "template" ? patch.template_language?.trim() ?? null : null,
      template_parameters: patch.reply_mode === "template" ? patch.template_parameters : [],
    })
    .eq("key", key);
  if (error) throw new Error(`No se pudo actualizar system template ${key}: ${error.message}`);
}

export async function enviarConfirmacionKeyword(
  telefono: string,
  key: SystemTemplateKey,
  config: WhatsappConfigResuelto,
): Promise<void> {
  const tpl = await leerSystemTemplate(key).catch(() => null);
  if (!tpl) return;

  if (tpl.reply_mode === "text") {
    const t = tpl.texto.trim();
    if (!t) return;
    await sendTextMessage(telefono, t, config);
    return;
  }

  if (tpl.reply_mode !== "template" || !tpl.template_name?.trim() || !tpl.template_language?.trim()) {
    return;
  }

  const todas = await listApprovedTemplates(config);
  const meta = todas.find(
    (x) => x.name === tpl.template_name?.trim() && x.language === tpl.template_language?.trim(),
  );
  if (!meta) {
    console.error(
      `[whatsapp] system template Meta no encontrada: ${tpl.template_name} (${tpl.template_language})`,
    );
    return;
  }

  const header = meta.components?.find((c) => c.type === "HEADER");
  const fmt = header?.format;
  if (fmt && ["IMAGE", "VIDEO", "DOCUMENT"].includes(fmt)) {
    console.error(
      `[whatsapp] plantilla con header multimedia no soportada para auto-respuesta: ${meta.name}`,
    );
    return;
  }

  const valores = tpl.template_parameters ?? [];
  const components = construirComponentesTemplateEnvio(meta, valores, null);
  await sendTemplateMessage(telefono, meta.name, meta.language, components, config);
}
