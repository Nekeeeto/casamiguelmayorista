/**
 * Estados de pedido Woo usados en analíticas de ventas web y gráficos por producto.
 *
 * Los slugs no se infieren del nombre visible (ej. "Espera MVD"); los define el plugin al registrar el estado.
 * Para listar los reales: Woo → Pedidos (filtro por estado) o
 * GET /wp-json/wc/v3/reports/orders/totals (muestra slugs con conteos).
 *
 * - `WOO_ORDER_STATUSES`: reemplaza por completo la lista (coma-separada, sin espacios obligatorios).
 * - `WOO_ORDER_STATUSES_EXTRA`: suma estados a los predeterminados (coma-separada).
 * - `WOO_ORDER_STATUSES_SIN_ESPERA_SUGERIDA=1`: quita los slugs sugeridos DAC/Espera (solo completed + processing + EXTRA).
 */

const ESTADOS_BASE = ["completed", "processing"] as const;

/** Slugs habituales para estados tipo "Espera *" (transferencia pendiente); verificá en tu tienda. */
const ESTADOS_ESPERA_TRANSFERENCIA_SUGERIDOS = [
  "espera-mvd",
  "espera-interior",
  "espera-pickup",
] as const;

function normalizarLista(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

function sinDuplicados(slugs: string[]): string[] {
  return [...new Set(slugs)];
}

export function estadosPedidoWooAnaliticas(): string[] {
  const reemplazo = process.env.WOO_ORDER_STATUSES?.trim();
  if (reemplazo) {
    return sinDuplicados(normalizarLista(reemplazo));
  }

  const extra = process.env.WOO_ORDER_STATUSES_EXTRA?.trim()
    ? normalizarLista(process.env.WOO_ORDER_STATUSES_EXTRA)
    : [];

  const sinSugeridos = process.env.WOO_ORDER_STATUSES_SIN_ESPERA_SUGERIDA === "1";
  const sugeridos = sinSugeridos ? [] : [...ESTADOS_ESPERA_TRANSFERENCIA_SUGERIDOS];

  return sinDuplicados([...ESTADOS_BASE, ...sugeridos, ...extra]);
}

/** Texto corto para tooltips / ayuda en UI. */
export function estadosPedidoWooAnaliticasResumen(): string {
  const lista = estadosPedidoWooAnaliticas();
  if (lista.length <= 5) return lista.join(", ");
  return `${lista.slice(0, 4).join(", ")}… (+${lista.length - 4})`;
}
