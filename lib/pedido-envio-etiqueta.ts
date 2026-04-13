import type { WooPedidoAdmin } from "@/lib/woo-pedido-admin-types";

function metodoIndicaRetiroLocal(methodId: string, methodTitle: string): boolean {
  const id = methodId.toLowerCase();
  const title = methodTitle.toLowerCase();
  if (id.includes("pickup") || id === "local_pickup" || id.includes("pick_up")) return true;
  if (title.includes("pickup")) return true;
  if (title.includes("retiro") && (title.includes("local") || title.includes("tienda") || title.includes("sucursal"))) {
    return true;
  }
  return false;
}

/** Pedido de retiro en local / pickup (aunque el estado ya sea `completed` u otro terminal). */
export function esPedidoFlujoPickup(p: WooPedidoAdmin): boolean {
  const st = (p.status ?? "").toLowerCase();
  if (st.includes("pickup")) return true;

  const lines = p.shipping_lines;
  if (!Array.isArray(lines)) return false;
  for (const line of lines) {
    const id = (line.method_id ?? "").trim();
    const title = (line.method_title ?? "").trim();
    if (id || title) {
      if (metodoIndicaRetiroLocal(id, title)) return true;
    }
  }
  return false;
}

/** Estados en los que no corresponde ofrecer etiqueta de envío (evita confusión). */
const SLUGS_SIN_ETIQUETA_ENVIO = new Set([
  "pending",
  "cancelled",
  "canceled",
  "failed",
  "refunded",
]);

/** Solo envíos que llevan etiqueta de correo. */
export function pedidoRequiereEtiquetaEnvio(p: WooPedidoAdmin): boolean {
  if (esPedidoFlujoPickup(p)) return false;
  const st = (p.status ?? "").trim().toLowerCase();
  if (SLUGS_SIN_ETIQUETA_ENVIO.has(st)) return false;
  return true;
}
