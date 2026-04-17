/** Claves localStorage solo para el widget Carga Mágica (navegador del admin). */

export const LS_PHOTOROOM_KEY = "cm_carga_magica_photoroom_v1";
export const LS_ANTHROPIC_KEY = "cm_carga_magica_anthropic_v1";
export const LS_TARIFAS = "cm_carga_magica_tarifas_v1";
export const LS_COST_LOG = "cm_carga_magica_cost_log_v1";
export const LS_PROMPT_SISTEMA = "cm_carga_magica_prompt_sistema_v1";
export const LS_ANTHROPIC_MODEL = "cm_carga_magica_model_v1";
/** `true` = no llamar a Photoroom (por defecto, para no bloquear si vence el plan). */
export const LS_OMITIR_PHOTOROOM = "cm_carga_magica_omitir_ph_v1";

/** Google AI (Gemini) — Herramientas › imágenes (opcional; alternativa a GEMINI_API_KEY en servidor). */
export const LS_GEMINI_KEY = "cm_herramientas_gemini_v1";

/** Modelos Claude con visión (Messages API). IDs oficiales Anthropic. */
export const MODELOS_CLAUDE_VISION: { id: string; label: string }[] = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (recomendado)" },
  { id: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5" },
  { id: "claude-sonnet-4-20250514", label: "Sonnet 4" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (más barato)" },
  { id: "claude-3-5-sonnet-20241022", label: "Sonnet 3.5 (legacy)" },
];

export const MODELO_CLAUDE_DEFAULT = "claude-sonnet-4-6";

export type TarifasCargaMagica = {
  /** USD por 1M tokens de entrada (Anthropic). */
  usdPorMillonInput: number;
  /** USD por 1M tokens de salida (Anthropic). */
  usdPorMillonOutput: number;
  /** USD fijos estimados por cada imagen procesada en Photoroom (1 llamada segment). */
  usdPorImagenPhotoroom: number;
};

export const TARIFAS_CARGA_MAGICA_DEFAULT: TarifasCargaMagica = {
  usdPorMillonInput: 3,
  usdPorMillonOutput: 15,
  usdPorImagenPhotoroom: 0.05,
};

export type EntradaLogCostoCargaMagica = {
  ts: string;
  ok: boolean;
  titulo_seo?: string;
  error?: string;
  photoroom_llamadas: number;
  anthropic_input_tokens: number;
  anthropic_output_tokens: number;
  usd_photoroom: number;
  usd_anthropic: number;
  usd_total: number;
};

function esBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function leerClavesWidgetDesdeLocal(): { photoroom: string; anthropic: string } {
  if (!esBrowser()) return { photoroom: "", anthropic: "" };
  return {
    photoroom: window.localStorage.getItem(LS_PHOTOROOM_KEY) ?? "",
    anthropic: window.localStorage.getItem(LS_ANTHROPIC_KEY) ?? "",
  };
}

export function guardarClavesWidgetEnLocal(photoroom: string, anthropic: string) {
  if (!esBrowser()) return;
  window.localStorage.setItem(LS_PHOTOROOM_KEY, photoroom.trim());
  window.localStorage.setItem(LS_ANTHROPIC_KEY, anthropic.trim());
}

export function borrarClavesWidgetLocal() {
  if (!esBrowser()) return;
  window.localStorage.removeItem(LS_PHOTOROOM_KEY);
  window.localStorage.removeItem(LS_ANTHROPIC_KEY);
}

export function leerGeminiKeyDesdeLocal(): string {
  if (!esBrowser()) return "";
  return window.localStorage.getItem(LS_GEMINI_KEY) ?? "";
}

export function guardarGeminiKeyEnLocal(clave: string) {
  if (!esBrowser()) return;
  window.localStorage.setItem(LS_GEMINI_KEY, clave.trim());
}

/** Por defecto `true` (no usar Photoroom) hasta que el operador lo desactive y lo guarde. */
export function leerOmitirPhotoroomDesdeLocal(): boolean {
  if (!esBrowser()) return true;
  const v = window.localStorage.getItem(LS_OMITIR_PHOTOROOM);
  if (v === null) return true;
  const s = v.trim().toLowerCase();
  if (s === "false" || s === "0" || s === "off") return false;
  return true;
}

export function guardarOmitirPhotoroomEnLocal(omitir: boolean) {
  if (!esBrowser()) return;
  window.localStorage.setItem(LS_OMITIR_PHOTOROOM, omitir ? "true" : "false");
}

export function leerPromptSistemaGuardado(): string | null {
  if (!esBrowser()) return null;
  const v = window.localStorage.getItem(LS_PROMPT_SISTEMA);
  return v && v.trim() ? v : null;
}

export function guardarPromptSistemaEnLocal(texto: string) {
  if (!esBrowser()) return;
  window.localStorage.setItem(LS_PROMPT_SISTEMA, texto);
}

export function leerModeloAnthropicGuardado(): string | null {
  if (!esBrowser()) return null;
  const v = window.localStorage.getItem(LS_ANTHROPIC_MODEL);
  return v && v.trim() ? v : null;
}

export function guardarModeloAnthropicEnLocal(modelo: string) {
  if (!esBrowser()) return;
  window.localStorage.setItem(LS_ANTHROPIC_MODEL, modelo.trim());
}

export function leerTarifasDesdeLocal(): TarifasCargaMagica {
  if (!esBrowser()) return { ...TARIFAS_CARGA_MAGICA_DEFAULT };
  try {
    const raw = window.localStorage.getItem(LS_TARIFAS);
    if (!raw) return { ...TARIFAS_CARGA_MAGICA_DEFAULT };
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      usdPorMillonInput: Math.max(0, Number(o.usdPorMillonInput ?? TARIFAS_CARGA_MAGICA_DEFAULT.usdPorMillonInput)),
      usdPorMillonOutput: Math.max(
        0,
        Number(o.usdPorMillonOutput ?? TARIFAS_CARGA_MAGICA_DEFAULT.usdPorMillonOutput),
      ),
      usdPorImagenPhotoroom: Math.max(
        0,
        Number(o.usdPorImagenPhotoroom ?? TARIFAS_CARGA_MAGICA_DEFAULT.usdPorImagenPhotoroom),
      ),
    };
  } catch {
    return { ...TARIFAS_CARGA_MAGICA_DEFAULT };
  }
}

export function guardarTarifasEnLocal(t: TarifasCargaMagica) {
  if (!esBrowser()) return;
  window.localStorage.setItem(LS_TARIFAS, JSON.stringify(t));
}

export function leerLogCostosDesdeLocal(): EntradaLogCostoCargaMagica[] {
  if (!esBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(LS_COST_LOG);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as EntradaLogCostoCargaMagica[]) : [];
  } catch {
    return [];
  }
}

export function guardarLogCostosEnLocal(entradas: EntradaLogCostoCargaMagica[]) {
  if (!esBrowser()) return;
  const max = 80;
  const recortado = entradas.slice(-max);
  window.localStorage.setItem(LS_COST_LOG, JSON.stringify(recortado));
}

export function enmascararClave(valor: string) {
  const v = valor.trim();
  if (!v) return "";
  if (v.length <= 8) return "••••••••";
  return `${"•".repeat(Math.min(12, v.length - 4))}${v.slice(-4)}`;
}

export function calcularCostosEstimadosUsd(args: {
  tarifas: TarifasCargaMagica;
  photoroomLlamadas: number;
  anthropicInputTokens: number;
  anthropicOutputTokens: number;
}) {
  const { tarifas, photoroomLlamadas, anthropicInputTokens, anthropicOutputTokens } = args;
  const usdPhotoroom = photoroomLlamadas * tarifas.usdPorImagenPhotoroom;
  const usdAnthropicIn = (anthropicInputTokens / 1_000_000) * tarifas.usdPorMillonInput;
  const usdAnthropicOut = (anthropicOutputTokens / 1_000_000) * tarifas.usdPorMillonOutput;
  const usdAnthropic = usdAnthropicIn + usdAnthropicOut;
  return {
    usd_photoroom: Number(usdPhotoroom.toFixed(6)),
    usd_anthropic: Number(usdAnthropic.toFixed(6)),
    usd_total: Number((usdPhotoroom + usdAnthropic).toFixed(6)),
  };
}
