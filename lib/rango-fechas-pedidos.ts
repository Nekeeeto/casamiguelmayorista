/** Calendario comercial para filtros de pedidos (Uruguay). */
export const ZONA_PEDIDOS_ADMIN = "America/Montevideo" as const;

export type PresetRangoPedidos = "hoy" | "semana" | "7d" | "mes" | "30d" | "90d";

export const PRESETS_RANGO_PEDIDOS: { id: PresetRangoPedidos; label: string }[] = [
  { id: "semana", label: "Esta semana" },
  { id: "hoy", label: "Hoy" },
  { id: "7d", label: "Últimos 7 días" },
  { id: "mes", label: "Este mes" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "90d", label: "Últimos 90 días" },
];

export function ymdEnZonaMontevideo(fecha: Date): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: ZONA_PEDIDOS_ADMIN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

function utcNoonDesdeYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((n) => Number.parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
}

function diaSemanaCortoEnZona(fecha: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_PEDIDOS_ADMIN,
    weekday: "short",
  }).format(fecha);
}

export function addDiasCalendarioYmd(ymd: string, delta: number): string {
  const t = utcNoonDesdeYmd(ymd).getTime() + delta * 86400000;
  return ymdEnZonaMontevideo(new Date(t));
}

function primerDiaMesYmd(ymdHasta: string): string {
  const [y, m] = ymdHasta.split("-");
  return `${y}-${m}-01`;
}

export function rangoPresetPedidos(
  preset: PresetRangoPedidos,
  ahora: Date = new Date(),
): { desde: string; hasta: string } {
  const hasta = ymdEnZonaMontevideo(ahora);
  switch (preset) {
    case "hoy":
      return { desde: hasta, hasta };
    case "semana": {
      for (let i = 0; i < 7; i++) {
        const candidate = addDiasCalendarioYmd(hasta, -i);
        if (diaSemanaCortoEnZona(utcNoonDesdeYmd(candidate)) === "Mon") {
          return { desde: candidate, hasta };
        }
      }
      return { desde: hasta, hasta };
    }
    case "7d":
      return { desde: addDiasCalendarioYmd(hasta, -6), hasta };
    case "mes":
      return { desde: primerDiaMesYmd(hasta), hasta };
    case "30d":
      return { desde: addDiasCalendarioYmd(hasta, -29), hasta };
    case "90d":
      return { desde: addDiasCalendarioYmd(hasta, -89), hasta };
    default:
      return { desde: hasta, hasta };
  }
}

export function rangoDefaultPedidos(ahora: Date = new Date()) {
  return rangoPresetPedidos("semana", ahora);
}

export function detectarPresetPedidos(desde: string, hasta: string, ahora: Date = new Date()): PresetRangoPedidos | null {
  for (const { id } of PRESETS_RANGO_PEDIDOS) {
    const r = rangoPresetPedidos(id, ahora);
    if (r.desde === desde && r.hasta === hasta) return id;
  }
  return null;
}

/** `YYYY-MM-DD` → `DD-MM-YYYY` para mostrar en inputs. */
export function formatoDdMmYyyyDesdeYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return "";
  return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
}

/** Acepta `DD-MM-YYYY` o `D-M-YYYY` → `YYYY-MM-DD` o `null`. */
export function formatoYmdDesdeDdMmYyyy(texto: string): string | null {
  const t = texto.trim();
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(t);
  if (!m) return null;
  const dia = Number.parseInt(m[1], 10);
  const mes = Number.parseInt(m[2], 10);
  const anio = Number.parseInt(m[3], 10);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const dt = new Date(Date.UTC(anio, mes - 1, dia));
  if (dt.getUTCFullYear() !== anio || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) return null;
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
