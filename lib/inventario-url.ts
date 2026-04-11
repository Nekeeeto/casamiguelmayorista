export type OrdenInventario = "woo_id" | "ventas_web";
export type PageSizeInventario = "20" | "50" | "100" | "max";

export function construirQueryInventario(params: {
  page?: number;
  categoria?: string;
  subcategoria?: string;
  /** Publicado en canal mayorista (activo en productos_mayoristas). */
  mayorista?: "si" | "no" | "";
  orden?: OrdenInventario;
  pageSize?: PageSizeInventario;
  /** Nombre, SKU o precio (coincidencia exacta con 2 decimales). */
  q?: string;
  /** Chips de alertas (sinStock,sinCosto,sinSku,sinProveedor), separados por coma. */
  alertas?: string;
}) {
  const busqueda = new URLSearchParams();
  busqueda.set("tab", "inventario");
  busqueda.set("page", String(params.page ?? 1));
  if (params.categoria) {
    busqueda.set("categoria", params.categoria);
  }
  if (params.subcategoria) {
    busqueda.set("subcategoria", params.subcategoria);
  }
  if (params.mayorista === "si" || params.mayorista === "no") {
    busqueda.set("mayorista", params.mayorista);
  }
  if (params.orden === "ventas_web") {
    busqueda.set("orden", "ventas_web");
  }
  if (params.pageSize && params.pageSize !== "20") {
    busqueda.set("pageSize", params.pageSize);
  }
  const qTrim = String(params.q ?? "").trim();
  if (qTrim) {
    busqueda.set("q", qTrim);
  }
  const alertasTrim = String(params.alertas ?? "").trim();
  if (alertasTrim) {
    busqueda.set("alertas", alertasTrim);
  }
  return `/admin?${busqueda.toString()}`;
}
