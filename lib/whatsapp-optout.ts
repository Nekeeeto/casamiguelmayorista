import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type KeywordOptOut = "opt_out" | "opt_in";

const KEYWORDS_OPT_OUT = new Set(["BAJA", "STOP", "UNSUBSCRIBE", "CANCELAR", "DESUSCRIBIR"]);
const KEYWORDS_OPT_IN = new Set(["ACTIVAR", "ALTA", "SUBSCRIBE", "START"]);

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Detecta intención opt-out/opt-in en texto entrante. Requiere que la palabra
 * sea el cuerpo completo del mensaje (con tolerancia a signos) para evitar
 * falsos positivos como "no me voy de baja, quiero más info".
 */
export function detectarKeywordOptOut(texto: string): KeywordOptOut | null {
  if (!texto) return null;
  const limpio = normalizar(texto).replace(/[^\w\s]/g, "").trim();
  if (!limpio) return null;
  if (KEYWORDS_OPT_OUT.has(limpio)) return "opt_out";
  if (KEYWORDS_OPT_IN.has(limpio)) return "opt_in";
  return null;
}

export async function marcarOptOut(telefono: string): Promise<void> {
  await upsertEstadoContacto(telefono, true);
}

export async function marcarOptIn(telefono: string): Promise<void> {
  await upsertEstadoContacto(telefono, false);
}

async function upsertEstadoContacto(telefono: string, optedOut: boolean): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("whatsapp_contacts").upsert(
    {
      telefono,
      opted_out: optedOut,
      opted_out_at: optedOut ? new Date().toISOString() : null,
    },
    { onConflict: "telefono", ignoreDuplicates: false },
  );
  if (error) throw new Error(`No se pudo actualizar opt-out de ${telefono}: ${error.message}`);
}
