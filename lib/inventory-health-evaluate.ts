export type InventoryHealthAlertKey =
  | "sinStock"
  | "sinCosto"
  | "sinSku"
  | "sinProveedor";

export type FilaInventarioHealthInput = {
  woo_product_id: number;
  sku: string | null;
  stock_status?: string | null;
  stock_quantity?: number | null;
  categoria_ids?: number[] | null;
  precio_costo: number | null | undefined;
  proveedor_id: string | null | undefined;
};

/** Misma regla que el panel admin (alertas de catálogo). */
export function evaluarAlertasInventario(p: FilaInventarioHealthInput): Set<InventoryHealthAlertKey> {
  const alerts = new Set<InventoryHealthAlertKey>();

  const stockQty = Number(p.stock_quantity ?? NaN);
  const stockStatus = String(p.stock_status ?? "").toLowerCase();
  if (stockStatus === "outofstock" || (Number.isFinite(stockQty) && stockQty <= 0)) {
    alerts.add("sinStock");
  }

  const costo = Number(p.precio_costo ?? NaN);
  if (!Number.isFinite(costo) || costo <= 0) {
    alerts.add("sinCosto");
  }

  if (!String(p.sku ?? "").trim()) {
    alerts.add("sinSku");
  }

  const prov = p.proveedor_id;
  if (!prov || !String(prov).trim()) {
    alerts.add("sinProveedor");
  }

  return alerts;
}

export type FilaCategoriaHealth = { woo_term_id: number; id_padre: number };

export function idsCategoriasRaiz(
  categorias: FilaCategoriaHealth[],
): { raices: number[]; parentById: Map<number, number>; rootsSet: Set<number> } {
  const idsConocidos = new Set(categorias.map((c) => c.woo_term_id));
  const raices = categorias
    .filter((c) => c.id_padre === 0 || !idsConocidos.has(c.id_padre))
    .map((c) => c.woo_term_id);
  const parentById = new Map<number, number>();
  for (const c of categorias) {
    parentById.set(c.woo_term_id, c.id_padre);
  }
  return { raices, parentById, rootsSet: new Set(raices) };
}

export function resolverRaizCategoria(
  idCategoria: number,
  parentById: Map<number, number>,
  rootsSet: Set<number>,
): number | null {
  let actual = idCategoria;
  let seguridad = 0;
  while (seguridad < 40) {
    if (rootsSet.has(actual)) return actual;
    const padre = parentById.get(actual);
    if (!padre || padre <= 0 || padre === actual) {
      return rootsSet.has(actual) ? actual : null;
    }
    actual = padre;
    seguridad += 1;
  }
  return null;
}

export function acumularHealthGlobal(
  filas: FilaInventarioHealthInput[],
  categorias: FilaCategoriaHealth[],
): {
  totals: Record<InventoryHealthAlertKey, number>;
  byRootCategory: Record<string, number>;
} {
  const totals: Record<InventoryHealthAlertKey, number> = {
    sinStock: 0,
    sinCosto: 0,
    sinSku: 0,
    sinProveedor: 0,
  };
  const byRootCategory = new Map<number, number>();
  const { parentById, rootsSet } = idsCategoriasRaiz(categorias);

  for (const fila of filas) {
    const alerts = evaluarAlertasInventario(fila);
    for (const alert of alerts) {
      totals[alert] += 1;
    }
    if (alerts.size === 0) continue;

    const rootsForProduct = new Set<number>();
    const categoriaIds = Array.isArray(fila.categoria_ids) ? fila.categoria_ids : [];
    for (const catId of categoriaIds) {
      const root = resolverRaizCategoria(Number(catId), parentById, rootsSet);
      if (root != null) rootsForProduct.add(root);
    }
    for (const rootId of rootsForProduct) {
      byRootCategory.set(rootId, (byRootCategory.get(rootId) ?? 0) + alerts.size);
    }
  }

  const byRootCategoryOut: Record<string, number> = {};
  for (const [id, n] of byRootCategory) {
    byRootCategoryOut[String(id)] = n;
  }
  return { totals, byRootCategory: byRootCategoryOut };
}
