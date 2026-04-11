import type { SupabaseClient } from "@supabase/supabase-js";

import { idsCategoriaMasDescendientes } from "@/lib/inventario-categorias";
import type { InventoryHealthAlertKey } from "@/lib/inventory-health-evaluate";
import { obtenerIdsWooMayoristaActivo } from "@/lib/inventario-mayorista-filtro";
import type { OrdenInventario } from "@/lib/inventario-url";

const CLAVES_ALERTA_INVENTARIO: InventoryHealthAlertKey[] = [
  "sinStock",
  "sinCosto",
  "sinSku",
  "sinProveedor",
];

export function parseAlertasInventarioParam(raw: string | null | undefined): InventoryHealthAlertKey[] {
  if (!raw?.trim()) return [];
  const out: InventoryHealthAlertKey[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim() as InventoryHealthAlertKey;
    if (CLAVES_ALERTA_INVENTARIO.includes(t)) {
      out.push(t);
    }
  }
  return out;
}

export type FilaCategoriaInventarioAdmin = {
  woo_term_id: number;
  nombre: string;
  id_padre: number;
};

export type ProductoCacheInventarioAdmin = {
  woo_product_id: number;
  sku: string | null;
  name: string;
  base_price: number | null;
  status: string;
  image_url: string | null;
  ventas_web: number | null;
  categoria_ids?: number[] | null;
  stock_status?: string | null;
  manage_stock?: boolean | null;
  stock_quantity?: number | null;
};

export type ProductoMayoristaInventarioAdmin = {
  woo_product_id: number;
  activo: boolean | null;
  precio_venta: number | null;
  precio_costo: number;
  ventas_mayorista: number;
  proveedor_id?: string | null;
};

type ProductoMayoristaLegacy = {
  woo_product_id: number;
  is_active: boolean | null;
  custom_price: number | null;
  precio_costo?: number | null;
  ventas_mayorista?: number | null;
  proveedor_id?: string | null;
};

type OpcionesColumnasCache = { ventasWeb: boolean; stock: boolean };

/** IDs Woo para filtrar productos por categoría raíz y/o subcategoría (misma lógica que el listado admin). */
export function armarIdsFiltroCategorias(
  filasCategoriasWoo: FilaCategoriaInventarioAdmin[],
  categoriaParam: string,
  subcategoriaParam: string,
): number[] {
  const idCategoriaFiltro = Number.parseInt(String(categoriaParam ?? ""), 10);
  const idSubcategoriaFiltro = Number.parseInt(String(subcategoriaParam ?? ""), 10);

  if (Number.isFinite(idSubcategoriaFiltro) && idSubcategoriaFiltro > 0) {
    const filaSub = filasCategoriasWoo.find((fila) => fila.woo_term_id === idSubcategoriaFiltro);
    if (filaSub) {
      if (
        Number.isFinite(idCategoriaFiltro) &&
        idCategoriaFiltro > 0 &&
        filaSub.id_padre !== idCategoriaFiltro
      ) {
        return idsCategoriaMasDescendientes(idCategoriaFiltro, filasCategoriasWoo);
      }
      return [idSubcategoriaFiltro];
    }
  } else if (Number.isFinite(idCategoriaFiltro) && idCategoriaFiltro > 0) {
    return idsCategoriaMasDescendientes(idCategoriaFiltro, filasCategoriasWoo);
  }
  return [];
}

function aplicarFiltroBusqueda(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  qTrim: string,
) {
  if (!qTrim) return q;
  const esc = qTrim.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const pat = `%${esc}%`;
  const num = Number.parseFloat(qTrim.replace(/\s/g, "").replace(",", "."));
  const parts = [`name.ilike.${pat}`, `sku.ilike.${pat}`];
  if (Number.isFinite(num) && num >= 0) {
    parts.push(`base_price.eq.${Number(num.toFixed(2))}`);
  }
  return q.or(parts.join(","));
}

/**
 * Listado inventario admin: categoría y subcategoría opcionales (sin ambas = todo el catálogo en caché);
 * búsqueda por nombre, SKU o precio (exacto).
 */
export async function cargarInventarioAdminPagina(
  supabaseAdmin: SupabaseClient,
  params: {
    filasCategoriasWoo: FilaCategoriaInventarioAdmin[];
    categoriaParam: string;
    subcategoriaParam: string;
    mayoristaParam: string;
    ordenParam: string;
    pagina: number;
    tamanoPagina: number;
    qParam: string;
    /** Filtro server-side (misma semántica que los chips de alertas del panel). */
    alertasFiltro?: InventoryHealthAlertKey[];
  },
): Promise<{
  cacheRows: ProductoCacheInventarioAdmin[];
  productosMayoristas: ProductoMayoristaInventarioAdmin[];
  total: number;
  totalPages: number;
  inicioRango: number;
}> {
  const idsFiltroCategorias = armarIdsFiltroCategorias(
    params.filasCategoriasWoo,
    params.categoriaParam,
    params.subcategoriaParam,
  );

  const pagina = Math.max(1, params.pagina);
  const inicioRango = (pagina - 1) * params.tamanoPagina;
  const desde = inicioRango;
  const hasta = desde + params.tamanoPagina - 1;

  const filtroMayorista =
    params.mayoristaParam === "si" || params.mayoristaParam === "no"
      ? params.mayoristaParam
      : null;
  const ordenInventario: OrdenInventario =
    params.ordenParam === "ventas_web" ? "ventas_web" : "woo_id";

  const idsActivosFiltroMayorista =
    filtroMayorista === "si" || filtroMayorista === "no"
      ? await obtenerIdsWooMayoristaActivo(supabaseAdmin)
      : null;

  const qTrim = String(params.qParam ?? "").trim();
  const alertas = params.alertasFiltro ?? [];

  /** IDs Woo con fila mayorista que cumple sin costo / sin proveedor (no incluye productos sin fila PM). */
  async function idsWooDesdeMayoristaAlertas(): Promise<number[] | null> {
    const needCost = alertas.includes("sinCosto");
    const needProv = alertas.includes("sinProveedor");
    if (!needCost && !needProv) {
      return null;
    }

    type FilaPm = { woo_product_id: number };
    const acumular = async (
      tabla: "productos_mayoristas" | "wholesale_products",
    ): Promise<number[] | null> => {
      const probeTabla = await supabaseAdmin.from(tabla).select("woo_product_id").limit(1);
      if (probeTabla.error?.message.includes("Could not find the table")) {
        return null;
      }
      let aplicarFiltroProveedor = false;
      if (needProv) {
        const probeCol = await supabaseAdmin.from(tabla).select("proveedor_id").limit(1);
        aplicarFiltroProveedor = !probeCol.error?.message?.includes("proveedor_id");
      }

      const set = new Set<number>();
      let from = 0;
      const PAGE = 1000;
      for (;;) {
        let q = supabaseAdmin.from(tabla).select("woo_product_id");
        if (needCost) {
          q = q.or("precio_costo.is.null,precio_costo.lte.0");
        }
        if (needProv && aplicarFiltroProveedor) {
          q = q.is("proveedor_id", null);
        }
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) {
          return null;
        }
        const rows = (data ?? []) as FilaPm[];
        for (const r of rows) {
          set.add(Number(r.woo_product_id));
        }
        if (rows.length < PAGE) {
          break;
        }
        from += PAGE;
        if (from > 200000) {
          break;
        }
      }
      return [...set];
    };

    let ids = await acumular("productos_mayoristas");
    if (ids === null) {
      ids = await acumular("wholesale_products");
    }
    return ids;
  }

  const idsFiltroPmAlertas = await idsWooDesdeMayoristaAlertas();

  const armarConsultaInventarioCache = (opts: OpcionesColumnasCache) => {
    const partes = [
      "woo_product_id",
      "sku",
      "name",
      "base_price",
      "status",
      "image_url",
      "categoria_ids",
    ];
    if (opts.ventasWeb) partes.push("ventas_web");
    if (opts.stock) partes.push("stock_status", "manage_stock", "stock_quantity");
    const columnas = partes.join(", ");

    let query = supabaseAdmin.from("woo_product_cache").select(columnas, { count: "exact" });

    const ordenEfectivo =
      opts.ventasWeb && ordenInventario === "ventas_web" ? "ventas_web" : "woo_id";
    if (ordenEfectivo === "ventas_web") {
      query = query
        .order("ventas_web", { ascending: false })
        .order("woo_product_id", { ascending: true });
    } else {
      query = query.order("woo_product_id", { ascending: true });
    }

    if (idsFiltroCategorias.length > 0) {
      query = query.overlaps("categoria_ids", idsFiltroCategorias);
    }

    query = aplicarFiltroBusqueda(query, qTrim);

    if (filtroMayorista === "si" && idsActivosFiltroMayorista != null) {
      if (idsActivosFiltroMayorista.length === 0) {
        query = query.in("woo_product_id", [-1]);
      } else {
        query = query.in("woo_product_id", idsActivosFiltroMayorista);
      }
    } else if (filtroMayorista === "no" && idsActivosFiltroMayorista != null) {
      if (idsActivosFiltroMayorista.length > 0) {
        query = query.not("woo_product_id", "in", `(${idsActivosFiltroMayorista.join(",")})`);
      }
    }

    if (alertas.includes("sinSku")) {
      query = query.or("sku.is.null,sku.eq.");
    }
    if (alertas.includes("sinStock") && opts.stock) {
      query = query.or("stock_status.eq.outofstock,stock_quantity.lte.0");
    }
    if (idsFiltroPmAlertas != null) {
      if (idsFiltroPmAlertas.length === 0) {
        query = query.in("woo_product_id", [-1]);
      } else {
        query = query.in("woo_product_id", idsFiltroPmAlertas);
      }
    }

    return query;
  };

  let optsColumnas: OpcionesColumnasCache = { ventasWeb: true, stock: true };
  let resCache = await armarConsultaInventarioCache(optsColumnas).range(desde, hasta);
  let cacheData = resCache.data;
  let cacheError = resCache.error;
  let count = resCache.count;

  for (let intento = 0; intento < 4 && cacheError; intento += 1) {
    const msg = cacheError.message;
    let ajustado = false;
    if (optsColumnas.ventasWeb && msg.includes("ventas_web")) {
      optsColumnas = { ...optsColumnas, ventasWeb: false };
      ajustado = true;
    }
    if (
      optsColumnas.stock &&
      (msg.includes("stock_status") ||
        msg.includes("manage_stock") ||
        msg.includes("stock_quantity"))
    ) {
      optsColumnas = { ...optsColumnas, stock: false };
      ajustado = true;
    }
    if (!ajustado) {
      break;
    }
    resCache = await armarConsultaInventarioCache(optsColumnas).range(desde, hasta);
    cacheData = resCache.data;
    cacheError = resCache.error;
    count = resCache.count;
  }

  if (cacheError) {
    throw new Error(cacheError.message);
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / params.tamanoPagina));

  const cacheRows = ((cacheData as unknown as ProductoCacheInventarioAdmin[]) ?? []).map((fila) => ({
    ...fila,
    ventas_web: fila.ventas_web ?? 0,
    categoria_ids: Array.isArray(fila.categoria_ids) ? fila.categoria_ids : [],
    stock_status: fila.stock_status ?? null,
    manage_stock: fila.manage_stock ?? null,
    stock_quantity: fila.stock_quantity ?? null,
  }));

  const ids = cacheRows.map((producto) => producto.woo_product_id);
  let productosMayoristas: ProductoMayoristaInventarioAdmin[] = [];

  if (ids.length > 0) {
    type RespuestaSelectPm = { data: unknown; error: { message: string } | null };
    let respuestaPm = (await supabaseAdmin
      .from("productos_mayoristas")
      .select("woo_product_id, activo, precio_venta, precio_costo, ventas_mayorista, proveedor_id")
      .in("woo_product_id", ids)) as RespuestaSelectPm;

    if (respuestaPm.error && respuestaPm.error.message.includes("proveedor_id")) {
      respuestaPm = (await supabaseAdmin
        .from("productos_mayoristas")
        .select("woo_product_id, activo, precio_venta, precio_costo, ventas_mayorista")
        .in("woo_product_id", ids)) as RespuestaSelectPm;
    }

    if (
      respuestaPm.error &&
      !respuestaPm.error.message.includes("Could not find the table 'public.productos_mayoristas'") &&
      respuestaPm.error.message.includes("ventas_mayorista")
    ) {
      respuestaPm = (await supabaseAdmin
        .from("productos_mayoristas")
        .select("woo_product_id, activo, precio_venta, precio_costo, proveedor_id")
        .in("woo_product_id", ids)) as RespuestaSelectPm;
    }

    if (
      respuestaPm.error &&
      !respuestaPm.error.message.includes("Could not find the table 'public.productos_mayoristas'") &&
      respuestaPm.error.message.includes("precio_costo")
    ) {
      respuestaPm = (await supabaseAdmin
        .from("productos_mayoristas")
        .select("woo_product_id, activo, precio_venta, proveedor_id")
        .in("woo_product_id", ids)) as RespuestaSelectPm;
    }

    const error = respuestaPm.error;
    const data = respuestaPm.data;

    if (error) {
      const tablaNoExiste = error.message.includes(
        "Could not find the table 'public.productos_mayoristas'",
      );

      if (!tablaNoExiste) {
        throw new Error(error.message);
      }

      type RespuestaLegacy = { data: unknown; error: { message: string } | null };
      let respuestaLegacy = (await supabaseAdmin
        .from("wholesale_products")
        .select("woo_product_id, is_active, custom_price, precio_costo, ventas_mayorista, proveedor_id")
        .in("woo_product_id", ids)) as RespuestaLegacy;

      if (respuestaLegacy.error && respuestaLegacy.error.message.includes("proveedor_id")) {
        respuestaLegacy = (await supabaseAdmin
          .from("wholesale_products")
          .select("woo_product_id, is_active, custom_price, precio_costo, ventas_mayorista")
          .in("woo_product_id", ids)) as RespuestaLegacy;
      }

      if (respuestaLegacy.error && respuestaLegacy.error.message.includes("ventas_mayorista")) {
        respuestaLegacy = (await supabaseAdmin
          .from("wholesale_products")
          .select("woo_product_id, is_active, custom_price, precio_costo")
          .in("woo_product_id", ids)) as RespuestaLegacy;
      }

      if (respuestaLegacy.error && respuestaLegacy.error.message.includes("precio_costo")) {
        respuestaLegacy = (await supabaseAdmin
          .from("wholesale_products")
          .select("woo_product_id, is_active, custom_price")
          .in("woo_product_id", ids)) as RespuestaLegacy;
      }

      const legacyError = respuestaLegacy.error;
      const legacyData = respuestaLegacy.data;

      if (legacyError) {
        throw new Error(legacyError.message);
      }

      productosMayoristas = ((legacyData as ProductoMayoristaLegacy[]) ?? []).map((row) => ({
        woo_product_id: row.woo_product_id,
        activo: row.is_active,
        precio_venta: row.custom_price,
        precio_costo: row.precio_costo ?? 0,
        ventas_mayorista: row.ventas_mayorista ?? 0,
        proveedor_id: row.proveedor_id ?? null,
      }));
    } else {
      const filas = (Array.isArray(data) ? data : []) as Partial<ProductoMayoristaInventarioAdmin>[];
      productosMayoristas = filas.map((row) => ({
        woo_product_id: row.woo_product_id as number,
        activo: row.activo ?? null,
        precio_venta: row.precio_venta ?? null,
        precio_costo: row.precio_costo ?? 0,
        ventas_mayorista: row.ventas_mayorista ?? 0,
        proveedor_id: row.proveedor_id ?? null,
      }));
    }
  }

  return {
    cacheRows,
    productosMayoristas,
    total,
    totalPages,
    inicioRango,
  };
}
