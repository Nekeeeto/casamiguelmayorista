import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchMapCantidadesVendidasReporteTopSellers,
  fetchWooProductById,
  type WooCategoriaArbol,
  type WooProduct,
} from "@/lib/woo";

type CacheUpsertRow = {
  woo_product_id: number;
  sku: string | null;
  name: string;
  base_price: number;
  image_url: string | null;
  status: string;
  woo_updated_at: string | null;
  synced_at: string;
  categoria_ids: number[];
  ventas_web: number;
  stock_status: string;
  manage_stock: boolean;
  stock_quantity: number | null;
};

type ColumnaOpcionalWooCache =
  | "categoria_ids"
  | "ventas_web"
  | "stock_status"
  | "manage_stock"
  | "stock_quantity";

function columnasOpcionalesDesdeError(mensajeError: string): ColumnaOpcionalWooCache[] {
  const m = mensajeError.toLowerCase();
  const out: ColumnaOpcionalWooCache[] = [];
  if (m.includes("categoria_ids")) out.push("categoria_ids");
  if (m.includes("ventas_web")) out.push("ventas_web");
  if (m.includes("stock_status")) out.push("stock_status");
  if (m.includes("manage_stock")) out.push("manage_stock");
  if (m.includes("stock_quantity")) out.push("stock_quantity");
  return out;
}

function eliminarColumnasOpcionales(
  filas: CacheUpsertRow[],
  columnasAExcluir: Set<ColumnaOpcionalWooCache>,
) {
  return filas.map((fila) => {
    const filaCopia: Record<string, unknown> = { ...fila };
    for (const columna of columnasAExcluir) {
      delete filaCopia[columna];
    }
    return filaCopia;
  });
}

type CategoriaCacheRow = {
  woo_term_id: number;
  nombre: string;
  slug: string;
  id_padre: number;
};

function getBasePrice(product: WooProduct) {
  const rawPrice =
    product.price || product.sale_price || product.regular_price || "0";
  const normalized = String(rawPrice).replace(",", ".");
  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  // Matches numeric(12,2) upper bound safety margin.
  const maxAllowed = 9999999999.99;
  if (parsed > maxAllowed) {
    return 0;
  }

  return Number(parsed.toFixed(2));
}

function normalizarVentasWeb(totalSales: unknown): number {
  if (totalSales == null || totalSales === "") {
    return 0;
  }
  const s = String(totalSales).trim().replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.min(Math.trunc(n), 2_147_483_647);
}

function totalSalesDesdeObjetoProducto(product: WooProduct): unknown {
  const r = product as unknown as Record<string, unknown>;
  const snake = r.total_sales;
  if (snake != null && snake !== "") return snake;
  const camel = r.totalSales;
  if (camel != null && camel !== "") return camel;
  return product.total_sales;
}

function parseParentIdWoo(product: WooProduct): number {
  const raw = product.parent_id;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Variaciones REST suelen traer total_sales=0; Woo acumula en el padre variable.
 * Si en `porId` está el padre, usamos su total_sales para la columna inventario.
 */
function resolverVentasWebParaCache(product: WooProduct, porId: Map<number, WooProduct>): number {
  const direct = normalizarVentasWeb(totalSalesDesdeObjetoProducto(product));
  if (direct > 0) {
    return direct;
  }
  const parentId = parseParentIdWoo(product);
  if (parentId <= 0) {
    return 0;
  }
  const parent = porId.get(parentId);
  if (!parent) {
    return 0;
  }
  return normalizarVentasWeb(totalSalesDesdeObjetoProducto(parent));
}

function normalizarStockStatus(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "outofstock" || s === "instock" || s === "onbackorder") {
    return s;
  }
  return "instock";
}

function normalizarStockQuantity(raw: unknown): number | null {
  if (raw == null || raw === "") {
    return null;
  }
  const n = Number.parseFloat(String(raw).replace(",", ".").trim());
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.trunc(n);
}

export function mapWooProductToCacheRow(
  product: WooProduct,
  porId: Map<number, WooProduct>,
): CacheUpsertRow {
  const idsCategorias = (product.categories ?? []).map((c) => c.id);

  const manageStock = Boolean(product.manage_stock);
  const qty = normalizarStockQuantity(product.stock_quantity);

  return {
    woo_product_id: product.id,
    sku: product.sku ?? null,
    name: product.name,
    base_price: getBasePrice(product),
    image_url: product.images?.[0]?.src ?? null,
    status: product.status ?? "publish",
    woo_updated_at: product.date_modified_gmt ?? null,
    synced_at: new Date().toISOString(),
    categoria_ids: idsCategorias,
    ventas_web: resolverVentasWebParaCache(product, porId),
    stock_status: normalizarStockStatus(product.stock_status),
    manage_stock: manageStock,
    stock_quantity: manageStock ? qty : null,
  };
}

function normalizarIdPadreWoo(parent: unknown): number {
  if (parent === null || parent === undefined) {
    return 0;
  }
  const n = Number(parent);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.trunc(n);
}

export function mapWooCategoriasACache(categorias: WooCategoriaArbol[]): CategoriaCacheRow[] {
  return categorias.map((categoria) => ({
    woo_term_id: categoria.id,
    nombre: categoria.name,
    slug: categoria.slug,
    id_padre: normalizarIdPadreWoo(categoria.parent),
  }));
}

export async function upsertWooCategoriesCache(
  supabaseAdmin: SupabaseClient,
  categorias: WooCategoriaArbol[],
) {
  if (categorias.length === 0) {
    return;
  }

  const filas = mapWooCategoriasACache(categorias);
  const { error } = await supabaseAdmin.from("woo_category_cache").upsert(filas, {
    onConflict: "woo_term_id",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertWooProductsCache(
  supabaseAdmin: SupabaseClient,
  products: WooProduct[],
) {
  if (products.length === 0) {
    return;
  }

  const porId = new Map(products.map((p) => [p.id, p]));
  const rows = products.map((p) => mapWooProductToCacheRow(p, porId));

  const hoyIso = new Date().toISOString().slice(0, 10);
  let mapaReporte = new Map<number, number>();
  try {
    mapaReporte = await fetchMapCantidadesVendidasReporteTopSellers("2000-01-01", hoyIso);
  } catch {
    mapaReporte = new Map();
  }
  for (const fila of rows) {
    if (fila.ventas_web > 0) continue;
    const desdeReporte = mapaReporte.get(fila.woo_product_id);
    if (desdeReporte != null && desdeReporte > 0) {
      fila.ventas_web = Math.min(desdeReporte, 2_147_483_647);
    }
  }

  const columnasExcluidas = new Set<ColumnaOpcionalWooCache>();

  for (let intento = 0; intento < 6; intento += 1) {
    const filasAUpsert = eliminarColumnasOpcionales(rows, columnasExcluidas);
    const { error } = await supabaseAdmin.from("woo_product_cache").upsert(filasAUpsert, {
      onConflict: "woo_product_id",
    });

    if (!error) {
      return;
    }

    const columnasDetectadas = columnasOpcionalesDesdeError(error.message);
    if (columnasDetectadas.length === 0) {
      throw new Error(error.message);
    }

    let agregoNueva = false;
    for (const columna of columnasDetectadas) {
      if (!columnasExcluidas.has(columna)) {
        columnasExcluidas.add(columna);
        agregoNueva = true;
      }
    }
    if (!agregoNueva) {
      throw new Error(error.message);
    }
  }

  throw new Error("No se pudo sincronizar woo_product_cache por columnas faltantes.");
}

export async function deleteWooProductsCache(
  supabaseAdmin: SupabaseClient,
  productIds: number[],
) {
  if (productIds.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("woo_product_cache")
    .delete()
    .in("woo_product_id", productIds);

  if (error) {
    throw new Error(error.message);
  }
}

/** Webhook: variación sin ventas en REST necesita fila del padre en el mismo upsert para `ventas_web`. */
export async function recolectarProductoYPadreParaCache(productId: number): Promise<WooProduct[]> {
  const fresh = (await fetchWooProductById(productId)) as WooProduct;
  const parentId = parseParentIdWoo(fresh);
  if (parentId <= 0 || normalizarVentasWeb(totalSalesDesdeObjetoProducto(fresh)) > 0) {
    return [fresh];
  }
  try {
    const parent = (await fetchWooProductById(parentId)) as WooProduct;
    return [fresh, parent];
  } catch {
    return [fresh];
  }
}
