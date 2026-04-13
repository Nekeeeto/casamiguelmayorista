import type { WooPedidoAdmin } from "@/lib/woo-pedido-admin-types";

/**
 * Estados Woo para conteos en paralelo (X-WP-Total) y chips en /admin/pedidos.
 * Sin `processing` / `on-hold` por defecto: en esta tienda se usan estados personalizados.
 */
export const ESTADOS_PEDIDO_CONTEO = [
  "pending",
  "proceso-mvd",
  "proceso-interior",
  "espera-mvd",
  "espera-interior",
  "espera-pickup",
  "proceso-pickup",
  "completed",
  "cancelled",
  "refunded",
  "failed",
] as const;

export const ETIQUETA_ESTADO_PEDIDO_ADMIN: Record<string, string> = {
  pending: "Pendiente de pago",
  "proceso-mvd": "Proceso MVD",
  "proceso-interior": "Proceso interior",
  "proceso-pickup": "Proceso pickup",
  "espera-mvd": "En espera MVD",
  "espera-interior": "En espera interior",
  "espera-pickup": "En espera pickup",
  completed: "Completado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  failed: "Fallido",
  processing: "En proceso",
  "on-hold": "En espera",
};

export function etiquetaEstadoPedidoAdmin(slug: string): string {
  return ETIQUETA_ESTADO_PEDIDO_ADMIN[slug] ?? slug.replace(/-/g, " ");
}

export type ListarPedidosAdminParams = {
  pagina?: number;
  porPagina?: number;
  fechaDesde?: string;
  fechaHasta?: string;
  estado?: string;
};

export type ListarPedidosAdminResult =
  | {
      ok: true;
      pedidos: WooPedidoAdmin[];
      total: number;
      totalPaginas: number;
      pagina: number;
      porPagina: number;
      fechaDesde: string;
      fechaHasta: string;
      estado: string;
      conteosPorEstado: Record<string, number>;
    }
  | { ok: false; error: string };

export type VistaPedidosAdminMeta = Omit<Extract<ListarPedidosAdminResult, { ok: true }>, "ok" | "pedidos">;

export type ResultadoActualizarEstadoPedido =
  | { ok: true; status: string }
  | { ok: false; error: string };
