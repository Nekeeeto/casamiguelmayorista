/**
 * Normaliza un teléfono para wa.me (solo dígitos, prefijo Uruguay 598).
 */
export function normalizarTelefonoWaUruguay(telefono: string | undefined | null): string | null {
  if (!telefono?.trim()) return null;
  const soloDigitos = telefono.replace(/\D/g, "");
  if (!soloDigitos) return null;
  if (soloDigitos.startsWith("598")) {
    return soloDigitos;
  }
  if (soloDigitos.startsWith("0")) {
    return `598${soloDigitos.slice(1)}`;
  }
  return `598${soloDigitos}`;
}

/**
 * Formato E.164 sin "+": "598" + 9 dígitos (mobile) o 8 dígitos (fijo).
 * WhatsApp Cloud API espera formato sin "+".
 */
export function esTelefonoUyValido(digitos: string): boolean {
  if (!/^598\d{8,9}$/.test(digitos)) return false;
  const resto = digitos.slice(3);
  if (resto.startsWith("9")) {
    return resto.length === 8;
  }
  return resto.length === 7 || resto.length === 8;
}

export type ResultadoValidacionNumeros = {
  validos: string[];
  invalidos: { input: string; motivo: string }[];
};

/**
 * Parsea y valida una lista libre de números (coma, salto de línea, espacio, punto y coma).
 * Dedup por número normalizado. Devuelve válidos como "598XXXXXXXX".
 */
export function validarListaNumerosUy(raw: string): ResultadoValidacionNumeros {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const vistos = new Set<string>();
  const validos: string[] = [];
  const invalidos: { input: string; motivo: string }[] = [];

  for (const token of tokens) {
    const normalizado = normalizarTelefonoWaUruguay(token);
    if (!normalizado) {
      invalidos.push({ input: token, motivo: "Vacío o sin dígitos." });
      continue;
    }
    if (!esTelefonoUyValido(normalizado)) {
      invalidos.push({ input: token, motivo: "Formato Uruguay inválido (esperado +598 + 8/9 dígitos)." });
      continue;
    }
    if (vistos.has(normalizado)) continue;
    vistos.add(normalizado);
    validos.push(normalizado);
  }

  return { validos, invalidos };
}

/**
 * Formato visual "+598 9X XXX XXX" para UI. Devuelve el input si no matchea.
 */
export function formatearTelefonoParaUi(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "");
  if (!digitos.startsWith("598")) return telefono;
  const resto = digitos.slice(3);
  if (resto.length === 8) {
    return `+598 ${resto.slice(0, 2)} ${resto.slice(2, 5)} ${resto.slice(5)}`;
  }
  if (resto.length === 9) {
    return `+598 ${resto.slice(0, 3)} ${resto.slice(3, 6)} ${resto.slice(6)}`;
  }
  return `+${digitos}`;
}
