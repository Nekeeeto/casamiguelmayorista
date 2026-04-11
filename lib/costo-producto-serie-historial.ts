export type FilaHistorialCostoProducto = {
  costo_anterior: number;
  costo_nuevo: number;
  fecha_modificacion: string;
};

export type PuntoSerieCostoDia = {
  dia: string;
  corto: string;
  costo: number;
};

function tsEvento(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Fin del día UTC (23:59:59.999) para una fecha YYYY-MM-DD. */
function finDiaUtcMs(isoDia: string): number {
  return Date.parse(`${isoDia}T23:59:59.999Z`);
}

function siguienteDiaIso(isoDia: string): string {
  const t = Date.parse(`${isoDia}T12:00:00.000Z`);
  const d = new Date(t);
  d.setUTCDate(d.getUTCDate() + 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Un punto por día en [desdeIso, hastaIso]: costo efectivo tras aplicar cambios del historial hasta fin de ese día.
 * Sin historial: línea plana al costo actual. Con historial: escalones según `historial_costos_productos`.
 */
export function serieCostoEfectivoPorDia(
  desdeIso: string,
  hastaIso: string,
  historial: FilaHistorialCostoProducto[],
  costoActualFallback: number,
): PuntoSerieCostoDia[] {
  const sorted = [...historial].sort(
    (a, b) => tsEvento(a.fecha_modificacion) - tsEvento(b.fecha_modificacion),
  );

  const inicioRangoMs = Date.parse(`${desdeIso}T00:00:00.000Z`);
  let eventIdx = 0;
  let costo = sorted.length > 0 ? Number(sorted[0].costo_anterior) : costoActualFallback;
  if (!Number.isFinite(costo)) costo = costoActualFallback;

  while (eventIdx < sorted.length && tsEvento(sorted[eventIdx].fecha_modificacion) < inicioRangoMs) {
    const n = Number(sorted[eventIdx].costo_nuevo);
    if (Number.isFinite(n)) costo = n;
    eventIdx += 1;
  }

  const out: PuntoSerieCostoDia[] = [];
  let dia = desdeIso;
  while (dia <= hastaIso) {
    const limite = finDiaUtcMs(dia);
    while (eventIdx < sorted.length && tsEvento(sorted[eventIdx].fecha_modificacion) <= limite) {
      const n = Number(sorted[eventIdx].costo_nuevo);
      if (Number.isFinite(n)) costo = n;
      eventIdx += 1;
    }
    out.push({
      dia,
      corto: dia.slice(5),
      costo: Number(costo.toFixed(2)),
    });
    if (dia === hastaIso) break;
    dia = siguienteDiaIso(dia);
  }
  return out;
}
