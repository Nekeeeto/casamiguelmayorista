import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

import { estadosPedidoWooAnaliticas } from "@/lib/woo-order-statuses-analiticas";

export type WooOrderLineItem = {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  subtotal: string;
  total: string;
};

export type WooOrderRefund = {
  id: number;
  total: string;
  reason?: string;
};

export type WooOrder = {
  id: number;
  status: string;
  date_created_gmt: string;
  /** Total del pedido según Woo (incluye envío e impuestos según configuración de la tienda). */
  total: string;
  shipping_total: string;
  discount_total?: string;
  line_items: WooOrderLineItem[];
  refunds?: WooOrderRefund[];
};

function getWooEnv(name: "WOO_URL" | "WOO_KEY" | "WOO_SECRET") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getWooClient() {
  return new WooCommerceRestApi({
    url: getWooEnv("WOO_URL"),
    consumerKey: getWooEnv("WOO_KEY"),
    consumerSecret: getWooEnv("WOO_SECRET"),
    version: "wc/v3",
  });
}

export type FetchWooOrdersOptions = {
  afterIso: string;
  beforeIso: string;
  /** Estados Woo REST; si se omite, usa `estadosPedidoWooAnaliticas()` (analíticas + DAC/Espera configurable). */
  statuses?: string[];
  maxPages?: number;
};

/**
 * Descarga pedidos en rango de fechas (GMT, ISO 8601).
 * Los ingresos por producto se calculan con line_items[].total (sin envío ni fees de pedido).
 */
export async function fetchWooOrdersInDateRange(
  options: FetchWooOrdersOptions,
): Promise<{ orders: WooOrder[]; truncado: boolean }> {
  const woo = getWooClient();
  const statuses = options.statuses ?? estadosPedidoWooAnaliticas();
  const maxPages = options.maxPages ?? 100;
  const orders: WooOrder[] = [];
  let page = 1;
  let truncado = false;

  while (page <= maxPages) {
    const { data } = await woo.get("orders", {
      after: options.afterIso,
      before: options.beforeIso,
      status: statuses.join(","),
      per_page: 100,
      page,
      order: "asc",
      orderby: "date",
    });

    const batch = (data as WooOrder[]) ?? [];
    orders.push(...batch);
    if (batch.length < 100) {
      break;
    }
    page += 1;
    if (page > maxPages) {
      truncado = true;
      break;
    }
  }

  return { orders, truncado };
}
