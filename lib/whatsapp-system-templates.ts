import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type SystemTemplateKey = "opt_out_confirmacion" | "opt_in_confirmacion";

export type SystemTemplateFila = {
  key: string;
  descripcion: string;
  texto: string;
  updated_at: string;
};

export async function listarSystemTemplates(): Promise<SystemTemplateFila[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_system_templates")
    .select("key, descripcion, texto, updated_at")
    .order("key");
  if (error) throw new Error(`No se pudo leer whatsapp_system_templates: ${error.message}`);
  return (data ?? []) as SystemTemplateFila[];
}

export async function leerSystemTemplate(key: SystemTemplateKey): Promise<SystemTemplateFila | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_system_templates")
    .select("key, descripcion, texto, updated_at")
    .eq("key", key)
    .maybeSingle<SystemTemplateFila>();
  if (error) throw new Error(`No se pudo leer system template ${key}: ${error.message}`);
  return data;
}

export async function actualizarSystemTemplate(key: SystemTemplateKey, texto: string): Promise<void> {
  if (texto.length > 1024) {
    throw new Error("El texto del template del sistema no puede superar 1024 caracteres.");
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("whatsapp_system_templates")
    .update({ texto })
    .eq("key", key);
  if (error) throw new Error(`No se pudo actualizar system template ${key}: ${error.message}`);
}
