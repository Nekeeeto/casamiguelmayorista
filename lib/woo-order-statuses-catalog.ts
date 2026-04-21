import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

import { ESTADOS_PEDIDO_CONTEO, etiquetaEstadoPedidoAdmin } from "@/lib/pedidos-admin-listado";
import { estadosPedidoWooAnaliticas } from "@/lib/woo-order-statuses-analiticas";

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

export function normalizarSlugEstadoPedidoWoo(slug: string): string {
  return slug.trim().toLowerCase().replace(/^wc-/, "");
}

export type OpcionEstadoPedidoWoo = { slug: string; label: string };

/**
 * Unión de slugs desde reporte Woo, estados del admin local y analíticas (.env), sin duplicados.
 */
export async function listarEstadosPedidoWooParaAdmin(): Promise<OpcionEstadoPedidoWoo[]> {
  const slugSet = new Set<string>();
  for (const s of ESTADOS_PEDIDO_CONTEO) {
    slugSet.add(normalizarSlugEstadoPedidoWoo(s));
  }
  for (const s of estadosPedidoWooAnaliticas()) {
    slugSet.add(normalizarSlugEstadoPedidoWoo(s));
  }
  try {
    const woo = getWooClient();
    const { data } = await woo.get("reports/orders/totals");
    const rows = (data as Array<{ slug?: string }> | null) ?? [];
    for (const r of rows) {
      if (typeof r.slug === "string" && r.slug.trim()) {
        slugSet.add(normalizarSlugEstadoPedidoWoo(r.slug));
      }
    }
  } catch {
    // sin totals: seguimos con listas locales
  }
  return [...slugSet]
    .sort((a, b) => a.localeCompare(b))
    .map((slug) => ({ slug, label: etiquetaEstadoPedidoAdmin(slug) }));
}
