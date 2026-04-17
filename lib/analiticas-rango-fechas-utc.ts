/**
 * Utilidades para rangos de analíticas Woo: las cadenas YYYY-MM-DD se interpretan
 * como día calendario en UTC (coherente con `construirRangoIsoGmt`).
 */

export function fechaIsoValidaAnaliticas(valor: string | undefined): valor is string {
  return Boolean(valor && /^\d{4}-\d{2}-\d{2}$/.test(valor));
}

/** Defaults alineados con `admin/page.tsx` (últimos ~30 días si faltan params). */
export function resolverRangoFechasAnaliticasDesdeQuery(
  desdeParam?: string,
  hastaParam?: string,
): { desde: string; hasta: string } {
  const hoy = new Date();
  const hastaDefault = hoy.toISOString().slice(0, 10);
  const desdeBase = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()),
  );
  desdeBase.setUTCDate(desdeBase.getUTCDate() - 30);
  const desdeDefault = desdeBase.toISOString().slice(0, 10);

  let desde = fechaIsoValidaAnaliticas(desdeParam) ? desdeParam : desdeDefault;
  let hasta = fechaIsoValidaAnaliticas(hastaParam) ? hastaParam : hastaDefault;
  if (desde > hasta) {
    const tmp = desde;
    desde = hasta;
    hasta = tmp;
  }
  return { desde, hasta };
}

export function parseIsoFechaUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map((n) => Number.parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatoIsoFechaUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Inicio del día actual en UTC (medianoche). */
export function utcHoy(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

function agregarDiasUtc(d: Date, dias: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + dias);
  return x;
}

export type PresetRangoAnaliticasId =
  | "ultimos_7"
  | "ultimos_30"
  | "este_mes"
  | "mes_anterior"
  | "este_anio"
  | "periodo_maximo"
  | "ayer";

export function rangoDesdePreset(id: PresetRangoAnaliticasId): { desde: Date; hasta: Date } {
  const hoy = utcHoy();
  switch (id) {
    case "ultimos_7":
      return { desde: agregarDiasUtc(hoy, -6), hasta: hoy };
    case "ultimos_30":
      return { desde: agregarDiasUtc(hoy, -29), hasta: hoy };
    case "este_mes":
      return {
        desde: new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1)),
        hasta: hoy,
      };
    case "mes_anterior": {
      const primerEsteMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
      const ultimoMesAnterior = agregarDiasUtc(primerEsteMes, -1);
      return {
        desde: new Date(
          Date.UTC(ultimoMesAnterior.getUTCFullYear(), ultimoMesAnterior.getUTCMonth(), 1),
        ),
        hasta: ultimoMesAnterior,
      };
    }
    case "este_anio":
      return {
        desde: new Date(Date.UTC(hoy.getUTCFullYear(), 0, 1)),
        hasta: hoy,
      };
    /** Rango amplio (30 años hacia atrás) para acercarse a todo el historial; la API Woo puede truncar por paginación. */
    case "periodo_maximo":
      return {
        desde: new Date(Date.UTC(hoy.getUTCFullYear() - 30, 0, 1)),
        hasta: hoy,
      };
    case "ayer": {
      const ayer = agregarDiasUtc(hoy, -1);
      return { desde: ayer, hasta: ayer };
    }
  }
}
