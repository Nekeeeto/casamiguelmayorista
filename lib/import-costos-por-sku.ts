import type { SupabaseClient } from "@supabase/supabase-js";

import { parseCostoCelda } from "@/lib/csv-utils";
import { proveedorIdParaNombre, resolverOCrearProveedoresPorNombre } from "@/lib/import-proveedores-por-nombre";

export type ResultadoEjecucionImportCostos = {
  actualizados: number;
  creados: number;
  filasCsvConCosto: number;
  sinMatchEnCatalogo: number;
  omitidasSinCosto: number;
  duplicadosSkuEnCsv: number;
  muestraSinMatch: string[];
  /** Filas del CSV con celda de proveedor no vacía (si se mapeó columna). */
  filasConProveedorCsv: number;
  /** Proveedores nuevos insertados en la tabla proveedores en esta corrida. */
  proveedoresCreadosEnDb: number;
};

type FilaCache = {
  woo_product_id: number;
  sku: string | null;
  name: string;
  base_price: number | string | null;
};

type CeldaPorSku = {
  costo: number;
  proveedorNombre: string | null;
};

function normalizarSku(s: string): string {
  return s
    .replace(/\uFEFF/g, "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizarNombreProveedorCelda(s: string): string | null {
  const t = s.replace(/\uFEFF/g, "").replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ");
  return t.length > 0 ? t : null;
}

async function columnaPrecioCostoWholesale(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("wholesale_products").select("precio_costo").limit(1);
  if (!error) {
    return true;
  }
  if (error.message.includes("precio_costo") || error.message.includes("schema cache")) {
    return false;
  }
  throw new Error(`wholesale_products: ${error.message}`);
}

async function tablaProductosMayoristasDisponible(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("productos_mayoristas").select("woo_product_id").limit(1);
  if (!error) {
    return true;
  }
  if (
    error.message.includes("Could not find the table") ||
    error.message.includes("schema cache")
  ) {
    return false;
  }
  throw new Error(`productos_mayoristas: ${error.message}`);
}

async function cargarMapaPmChunked(
  supabase: SupabaseClient,
  ids: number[],
): Promise<
  Map<number, { precio_venta: number; ventas_mayorista: number; nombre: string; sku: string | null; activo: boolean }>
> {
  const map = new Map<
    number,
    { precio_venta: number; ventas_mayorista: number; nombre: string; sku: string | null; activo: boolean }
  >();
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data: pmRows, error: pmErr } = await supabase
      .from("productos_mayoristas")
      .select("woo_product_id, precio_venta, ventas_mayorista, nombre, sku, activo")
      .in("woo_product_id", slice);
    if (pmErr) {
      throw new Error(pmErr.message);
    }
    for (const row of (pmRows ?? []) as {
      woo_product_id: number;
      precio_venta: number | null;
      ventas_mayorista: number | null;
      nombre: string;
      sku: string | null;
      activo: boolean;
    }[]) {
      map.set(Number(row.woo_product_id), {
        precio_venta: Number(row.precio_venta ?? 0),
        ventas_mayorista: Number(row.ventas_mayorista ?? 0),
        nombre: row.nombre,
        sku: row.sku,
        activo: row.activo,
      });
    }
  }
  return map;
}

async function cargarMapaWpChunked(
  supabase: SupabaseClient,
  ids: number[],
): Promise<Map<number, { custom_price: number | null; name: string; sku: string | null; is_active: boolean }>> {
  const map = new Map<
    number,
    { custom_price: number | null; name: string; sku: string | null; is_active: boolean }
  >();
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data: wpRows, error: wpErr } = await supabase
      .from("wholesale_products")
      .select("woo_product_id, custom_price, name, sku, is_active")
      .in("woo_product_id", slice);
    if (wpErr) {
      throw new Error(wpErr.message);
    }
    for (const row of (wpRows ?? []) as {
      woo_product_id: number;
      custom_price: number | null;
      name: string;
      sku: string | null;
      is_active: boolean;
    }[]) {
      map.set(Number(row.woo_product_id), {
        custom_price: row.custom_price,
        name: row.name,
        sku: row.sku,
        is_active: row.is_active,
      });
    }
  }
  return map;
}

export type OpcionesImportCostosPorSku = {
  /** Índice de columna con nombre fantasía del proveedor; null = no importar proveedor. */
  indiceProveedor: number | null;
};

/**
 * A partir de filas ya parseadas y los índices de columnas, arma SKU→costo (+ proveedor opcional)
 * y ejecuta actualizaciones contra productos mayoristas / legacy.
 */
export async function ejecutarImportCostosPorSkuDesdeFilas(
  supabase: SupabaseClient,
  filas: string[][],
  indiceSku: number,
  indiceCosto: number,
  opciones?: OpcionesImportCostosPorSku,
): Promise<ResultadoEjecucionImportCostos> {
  const indiceProveedor = opciones?.indiceProveedor ?? null;
  const usarColumnaProveedor =
    indiceProveedor != null &&
    Number.isFinite(indiceProveedor) &&
    indiceProveedor >= 0 &&
    indiceProveedor !== indiceSku &&
    indiceProveedor !== indiceCosto;

  const datosPorSku = new Map<string, CeldaPorSku>();
  let duplicadosSkuEnCsv = 0;
  let omitidasSinCosto = 0;
  let filasConProveedorCsv = 0;

  for (const celdas of filas) {
    const skuRaw = normalizarSku(celdas[indiceSku] ?? "");
    if (!skuRaw) {
      continue;
    }
    const costo = parseCostoCelda(celdas[indiceCosto] ?? "");
    if (costo == null) {
      omitidasSinCosto += 1;
      continue;
    }
    let proveedorNombre: string | null = null;
    if (usarColumnaProveedor) {
      proveedorNombre = normalizarNombreProveedorCelda(celdas[indiceProveedor!] ?? "");
      if (proveedorNombre) {
        filasConProveedorCsv += 1;
      }
    }
    const clave = skuRaw.toUpperCase();
    if (datosPorSku.has(clave)) {
      duplicadosSkuEnCsv += 1;
    }
    datosPorSku.set(clave, { costo, proveedorNombre });
  }

  const filasCsvConCosto = datosPorSku.size;

  let usarPm: boolean;
  try {
    usarPm = await tablaProductosMayoristasDisponible(supabase);
  } catch (e) {
    throw e;
  }

  if (!usarPm) {
    const okCosto = await columnaPrecioCostoWholesale(supabase);
    if (!okCosto) {
      throw new Error(
        "La tabla wholesale_products no tiene la columna precio_costo. Ejecutá en Supabase el bloque DO de supabase/schema_phase4_inventario_metricas.sql (solo la parte de wholesale_products).",
      );
    }
  } else {
    const { error: pmCostoErr } = await supabase.from("productos_mayoristas").select("precio_costo").limit(1);
    if (pmCostoErr && pmCostoErr.message.includes("precio_costo")) {
      throw new Error(
        "La tabla productos_mayoristas no tiene precio_costo. Revisá las migraciones (schema fase 3).",
      );
    }
    if (pmCostoErr) {
      throw new Error(pmCostoErr.message);
    }
  }

  const { data: cacheRows, error: cacheError } = await supabase
    .from("woo_product_cache")
    .select("woo_product_id, sku, name, base_price");

  if (cacheError) {
    throw new Error(`woo_product_cache: ${cacheError.message}`);
  }

  const filasCache = (cacheRows ?? []) as FilaCache[];
  const porSku = new Map<string, FilaCache[]>();
  for (const fila of filasCache) {
    const sku = normalizarSku(fila.sku ?? "");
    if (!sku) {
      continue;
    }
    const clave = sku.toUpperCase();
    const lista = porSku.get(clave) ?? [];
    lista.push(fila);
    porSku.set(clave, lista);
  }

  let sinMatchEnCatalogo = 0;
  const muestraSinMatch: string[] = [];

  for (const skuKey of datosPorSku.keys()) {
    const coincidencias = porSku.get(skuKey);
    if (!coincidencias?.length) {
      sinMatchEnCatalogo += 1;
      if (muestraSinMatch.length < 25) {
        muestraSinMatch.push(skuKey);
      }
    }
  }

  const idsObjetivo = new Set<number>();
  for (const skuKey of datosPorSku.keys()) {
    const coincidencias = porSku.get(skuKey);
    if (!coincidencias?.length) {
      continue;
    }
    for (const c of coincidencias) {
      idsObjetivo.add(Number(c.woo_product_id));
    }
  }

  const idsArr = [...idsObjetivo];

  const nombresProveedor = new Set<string>();
  if (usarColumnaProveedor) {
    for (const v of datosPorSku.values()) {
      if (v.proveedorNombre) {
        nombresProveedor.add(v.proveedorNombre);
      }
    }
  }

  let proveedoresCreadosEnDb = 0;
  let idPorNombreProveedor = new Map<string, string>();
  if (usarColumnaProveedor && nombresProveedor.size > 0) {
    const res = await resolverOCrearProveedoresPorNombre(supabase, [...nombresProveedor]);
    idPorNombreProveedor = res.idPorClave;
    proveedoresCreadosEnDb = res.creados;
  }

  const existentesPm = usarPm
    ? await cargarMapaPmChunked(supabase, idsArr)
    : new Map<
        number,
        { precio_venta: number; ventas_mayorista: number; nombre: string; sku: string | null; activo: boolean }
      >();

  const existentesWp = !usarPm
    ? await cargarMapaWpChunked(supabase, idsArr)
    : new Map<number, { custom_price: number | null; name: string; sku: string | null; is_active: boolean }>();

  let actualizados = 0;
  let creados = 0;

  for (const [skuKey, { costo, proveedorNombre }] of datosPorSku) {
    const coincidencias = porSku.get(skuKey);
    if (!coincidencias?.length) {
      continue;
    }

    const proveedorId =
      usarColumnaProveedor && proveedorNombre
        ? proveedorIdParaNombre(idPorNombreProveedor, proveedorNombre)
        : null;

    for (const cache of coincidencias) {
      const wooId = Number(cache.woo_product_id);
      const precioBase = Number(cache.base_price ?? 0);

      if (usarPm) {
        const prev = existentesPm.get(wooId);
        const payloadUpdate: Record<string, unknown> = { precio_costo: costo };
        if (proveedorId) {
          payloadUpdate.proveedor_id = proveedorId;
        }
        if (prev) {
          let { error } = await supabase
            .from("productos_mayoristas")
            .update(payloadUpdate)
            .eq("woo_product_id", wooId);
          if (error?.message.includes("proveedor_id")) {
            ({ error } = await supabase
              .from("productos_mayoristas")
              .update({ precio_costo: costo })
              .eq("woo_product_id", wooId));
          }
          if (error) {
            throw new Error(error.message);
          }
          actualizados += 1;
        } else {
          const insertRow: Record<string, unknown> = {
            woo_product_id: wooId,
            nombre: cache.name,
            sku: cache.sku ?? skuKey,
            precio_venta: Number.isFinite(precioBase) && precioBase >= 0 ? Number(precioBase.toFixed(2)) : 0,
            precio_costo: costo,
            activo: true,
            ventas_mayorista: 0,
            escalas_volumen: [],
          };
          if (proveedorId) {
            insertRow.proveedor_id = proveedorId;
          }
          let { error } = await supabase.from("productos_mayoristas").insert(insertRow);
          if (error?.message.includes("proveedor_id")) {
            delete insertRow.proveedor_id;
            ({ error } = await supabase.from("productos_mayoristas").insert(insertRow));
          }
          if (error) {
            throw new Error(error.message);
          }
          creados += 1;
          existentesPm.set(wooId, {
            precio_venta: precioBase,
            ventas_mayorista: 0,
            nombre: cache.name,
            sku: cache.sku,
            activo: true,
          });
        }
      } else {
        const prev = existentesWp.get(wooId);
        const payloadUpdate: Record<string, unknown> = { precio_costo: costo };
        if (proveedorId) {
          payloadUpdate.proveedor_id = proveedorId;
        }
        if (prev) {
          let { error } = await supabase
            .from("wholesale_products")
            .update(payloadUpdate)
            .eq("woo_product_id", wooId);
          if (error?.message.includes("proveedor_id")) {
            const sinP = { precio_costo: costo };
            ({ error } = await supabase.from("wholesale_products").update(sinP).eq("woo_product_id", wooId));
          }
          if (error) {
            throw new Error(error.message);
          }
          actualizados += 1;
        } else {
          const insertPayload: Record<string, unknown> = {
            woo_product_id: wooId,
            name: cache.name,
            sku: cache.sku ?? skuKey,
            custom_price:
              Number.isFinite(precioBase) && precioBase >= 0 ? Number(precioBase.toFixed(2)) : null,
            precio_costo: costo,
            is_active: true,
            min_quantity: 1,
          };
          if (proveedorId) {
            insertPayload.proveedor_id = proveedorId;
          }
          let { error } = await supabase.from("wholesale_products").insert(insertPayload);
          if (error?.message.includes("proveedor_id")) {
            delete insertPayload.proveedor_id;
            ({ error } = await supabase.from("wholesale_products").insert(insertPayload));
          }
          if (error) {
            throw new Error(error.message);
          }
          creados += 1;
        }
      }
    }
  }

  return {
    actualizados,
    creados,
    filasCsvConCosto,
    sinMatchEnCatalogo,
    omitidasSinCosto,
    duplicadosSkuEnCsv,
    muestraSinMatch,
    filasConProveedorCsv,
    proveedoresCreadosEnDb,
  };
}
