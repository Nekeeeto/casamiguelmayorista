import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type KeywordOptOut = "opt_out" | "opt_in";

export const KEYWORDS_OPT_OUT_DEFAULT = "BAJA,STOP,UNSUBSCRIBE,CANCELAR,DESUSCRIBIR";
export const KEYWORDS_OPT_IN_DEFAULT = "ACTIVAR,ALTA,SUBSCRIBE,START";

function normalizarToken(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

/** Una palabra por entrada; separador coma, punto y coma o salto de línea. */
export function parsearListaKeywordsCsv(csv: string): string[] {
  const partes = csv.split(/[,;\n]+/);
  const out: string[] = [];
  const visto = new Set<string>();
  for (const p of partes) {
    const t = normalizarToken(p).replace(/[^\w\s]/g, "").trim();
    if (!t || visto.has(t)) continue;
    visto.add(t);
    out.push(t);
  }
  return out;
}

export function setsDesdeCsv(optOutCsv: string, optInCsv: string): {
  opt_out: Set<string>;
  opt_in: Set<string>;
} {
  return {
    opt_out: new Set(parsearListaKeywordsCsv(optOutCsv || KEYWORDS_OPT_OUT_DEFAULT)),
    opt_in: new Set(parsearListaKeywordsCsv(optInCsv || KEYWORDS_OPT_IN_DEFAULT)),
  };
}

/**
 * Detecta intención opt-out/opt-in. El mensaje debe ser **solo** esa palabra
 * (tras normalizar), para evitar falsos positivos.
 */
export function detectarKeywordOptOut(
  texto: string,
  sets: { opt_out: Set<string>; opt_in: Set<string> },
): KeywordOptOut | null {
  if (!texto) return null;
  const limpio = normalizarToken(texto).replace(/[^\w\s]/g, "").trim();
  if (!limpio) return null;
  if (sets.opt_out.has(limpio)) return "opt_out";
  if (sets.opt_in.has(limpio)) return "opt_in";
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
