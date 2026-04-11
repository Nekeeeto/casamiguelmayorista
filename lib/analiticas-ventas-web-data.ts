import type { SupabaseClient } from "@supabase/supabase-js";

import {
  agregarVentasWebDesdePedidos,
  type InfoProductoCache,
  type ResultadoAnaliticasVentasWeb,
} from "@/lib/analiticas-ventas-web";
import { fetchWooOrdersInDateRange } from "@/lib/woo-orders";

export type CargaAnaliticasVentasWeb =
  | { ok: true; datos: ResultadoAnaliticasVentasWeb }
  | { ok: false; error: string };

async function cargarMapaCostos(supabaseAdmin: SupabaseClient): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();

  const { data, error } = await supabaseAdmin
    .from("productos_mayoristas")
    .select("woo_product_id, precio_costo");

  if (!error && data) {
    for (const fila of data as { woo_product_id: number; precio_costo: number | null }[]) {
      mapa.set(fila.woo_product_id, Number(fila.precio_costo ?? 0));
    }
    return mapa;
  }

  const tablaNoExiste = error?.message.includes(
    "Could not find the table 'public.productos_mayoristas'",
  );
  const columnaCostoAusente = error?.message.includes("precio_costo");
  if (!tablaNoExiste && error && !columnaCostoAusente) {
    throw new Error(error.message);
  }

  if (columnaCostoAusente && !tablaNoExiste) {
    const { data: sinCosto, error: err2 } = await supabaseAdmin
      .from("productos_mayoristas")
      .select("woo_product_id");
    if (!err2 && sinCosto) {
      for (const fila of sinCosto as { woo_product_id: number }[]) {
        mapa.set(fila.woo_product_id, 0);
      }
      return mapa;
    }
  }

  const { data: legacy, error: legacyError } = await supabaseAdmin
    .from("wholesale_products")
    .select("woo_product_id, precio_costo");

  if (legacyError?.message.includes("Could not find the table")) {
    return mapa;
  }

  if (legacyError && !legacyError.message.includes("precio_costo")) {
    throw new Error(legacyError.message);
  }

  if (legacyError?.message.includes("precio_costo")) {
    const { data: legIds, error: legErr2 } = await supabaseAdmin
      .from("wholesale_products")
      .select("woo_product_id");
    if (legErr2) {
      throw new Error(legErr2.message);
    }
    for (const fila of (legIds ?? []) as { woo_product_id: number }[]) {
      mapa.set(fila.woo_product_id, 0);
    }
    return mapa;
  }

  for (const fila of (legacy ?? []) as { woo_product_id: number; precio_costo?: number | null }[]) {
    mapa.set(fila.woo_product_id, Number(fila.precio_costo ?? 0));
  }

  return mapa;
}

async function cargarInfoProductos(
  supabaseAdmin: SupabaseClient,
): Promise<Map<number, InfoProductoCache>> {
  const mapa = new Map<number, InfoProductoCache>();
  const intentosColumnas = [
    "woo_product_id, name, sku, categoria_ids, image_url",
    "woo_product_id, name, sku, image_url",
    "woo_product_id, name, sku, categoria_ids",
    "woo_product_id, name, sku",
  ] as const;

  let data: unknown[] | null = null;
  let error: { message: string } | null = null;
  for (const columnas of intentosColumnas) {
    const r = await supabaseAdmin.from("woo_product_cache").select(columnas);
    if (!r.error) {
      data = r.data ?? [];
      error = null;
      break;
    }
    error = r.error;
  }

  if (error != null || data == null) {
    throw new Error(error?.message ?? "woo_product_cache");
  }

  for (const fila of data as {
    woo_product_id: number;
    name: string;
    sku: string | null;
    categoria_ids?: number[] | null;
    image_url?: string | null;
  }[]) {
    const rawIds = "categoria_ids" in fila ? fila.categoria_ids : null;
    const ids = Array.isArray(rawIds)
      ? rawIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    mapa.set(fila.woo_product_id, {
      name: fila.name,
      sku: fila.sku,
      categoria_ids: ids,
      image_url: fila.image_url ?? null,
    });
  }

  return mapa;
}

async function cargarNombresCategorias(
  supabaseAdmin: SupabaseClient,
): Promise<Map<number, string>> {
  const mapa = new Map<number, string>();
  const { data, error } = await supabaseAdmin
    .from("woo_category_cache")
    .select("woo_term_id, nombre");

  if (error) {
    const tablaAusente =
      error.message.includes("Could not find the table") ||
      error.message.includes("schema cache");
    if (tablaAusente) {
      return mapa;
    }
    throw new Error(error.message);
  }

  for (const fila of (data ?? []) as { woo_term_id: number; nombre: string }[]) {
    mapa.set(fila.woo_term_id, fila.nombre);
  }

  return mapa;
}

/** Rango inclusive en GMT (fin del día `hasta` inclusive). */
export function construirRangoIsoGmt(desde: string, hasta: string): {
  afterIso: string;
  beforeIso: string;
} {
  return {
    afterIso: `${desde}T00:00:00.000Z`,
    beforeIso: `${hasta}T23:59:59.999Z`,
  };
}

export type OpcionesCargaAnaliticasVentasWeb = {
  /** IDs Woo de categoría (incluye raíz y subcategorías). Vacío o null = sin filtro. */
  idsCategoriaFiltro: number[] | null;
};

export async function cargarAnaliticasVentasWeb(
  supabaseAdmin: SupabaseClient,
  desde: string,
  hasta: string,
  opciones?: OpcionesCargaAnaliticasVentasWeb,
): Promise<CargaAnaliticasVentasWeb> {
  try {
    const { afterIso, beforeIso } = construirRangoIsoGmt(desde, hasta);
    const [costos, infoProducto, nombresCategoria, { orders, truncado }] = await Promise.all([
      cargarMapaCostos(supabaseAdmin),
      cargarInfoProductos(supabaseAdmin),
      cargarNombresCategorias(supabaseAdmin),
      fetchWooOrdersInDateRange({ afterIso, beforeIso }),
    ]);

    const idsPerm =
      opciones?.idsCategoriaFiltro && opciones.idsCategoriaFiltro.length > 0
        ? new Set(opciones.idsCategoriaFiltro)
        : null;

    const datos = agregarVentasWebDesdePedidos(
      orders,
      costos,
      infoProducto,
      nombresCategoria,
      truncado,
      { idsCategoriaPermitidos: idsPerm },
    );
    return { ok: true, datos };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error al cargar analíticas.";
    return { ok: false, error: mensaje };
  }
}
