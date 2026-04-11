import type { WooOrder } from "@/lib/woo-orders";

export type PuntoSerieRentabilidadWebProducto = {
  dia: string;
  ingresos: number;
  unidades: number;
};

function parseDineroLinea(valor: string | undefined): number {
  if (valor === undefined || valor === null) {
    return 0;
  }
  const n = Number.parseFloat(String(valor).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Number(n.toFixed(2));
}

/**
 * Suma ingresos y unidades por día (GMT del pedido) para líneas que correspondan al producto
 * (simple: product_id; variable: variation_id).
 */
export function serieIngresosUnidadesProductoPorDia(
  orders: WooOrder[],
  productId: number,
): PuntoSerieRentabilidadWebProducto[] {
  const porDia = new Map<string, { ingresos: number; unidades: number }>();

  for (const pedido of orders) {
    const dia = (pedido.date_created_gmt ?? "").trim().slice(0, 10) || "1970-01-01";
    for (const linea of pedido.line_items ?? []) {
      const coincide =
        linea.product_id === productId ||
        (Number.isFinite(linea.variation_id) &&
          linea.variation_id > 0 &&
          linea.variation_id === productId);
      if (!coincide) {
        continue;
      }
      const qty = Number(linea.quantity);
      const cantidad = Number.isFinite(qty) && qty > 0 ? qty : 0;
      const ingreso = parseDineroLinea(linea.total);
      const acum = porDia.get(dia) ?? { ingresos: 0, unidades: 0 };
      acum.ingresos = Number((acum.ingresos + ingreso).toFixed(2));
      acum.unidades += cantidad;
      porDia.set(dia, acum);
    }
  }

  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, v]) => ({ dia, ingresos: v.ingresos, unidades: v.unidades }));
}
