"use server";

import { construirRangoIsoGmt } from "@/lib/analiticas-ventas-web-data";
import {
  serieCostoEfectivoPorDia,
  type FilaHistorialCostoProducto,
  type PuntoSerieCostoDia,
} from "@/lib/costo-producto-serie-historial";
import { serieIngresosUnidadesProductoPorDia } from "@/lib/rentabilidad-web-producto-serie";
import type { PuntoSerieRentabilidadWebProducto } from "@/lib/rentabilidad-web-producto-serie";
import { fetchWooOrdersInDateRange } from "@/lib/woo-orders";
import { updateWooProductPartial } from "@/lib/woo";
import { upsertProveedorProducto } from "@/lib/producto-proveedor-upsert";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseServidor } from "@/lib/supabase-servidor";

async function requireAdminActor() {
  const supabaseServidor = await getSupabaseServidor();
  const {
    data: { user },
    error: authError,
  } = await supabaseServidor.auth.getUser();

  if (authError || !user) {
    throw new Error("Sesion invalida.");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: perfil, error: perfilError } = await supabaseAdmin
    .from("perfiles_usuarios")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  if (perfilError) {
    throw new Error(perfilError.message);
  }
  if (perfil?.rol !== "admin") {
    throw new Error("Solo administradores.");
  }

  return { actorId: user.id };
}

export type ResultadoActualizarCampoWoo =
  | { ok: true; valor: unknown }
  | { ok: false; error: string };

export type ResultadoActualizarCamposWoo =
  | { ok: true; producto: Record<string, unknown> }
  | { ok: false; error: string };

export async function actualizarCampoWooProductoAction(
  productId: number,
  campo: string,
  valor: unknown,
): Promise<ResultadoActualizarCampoWoo> {
  try {
    await requireAdminActor();

    if (!Number.isFinite(productId) || productId <= 0) {
      return { ok: false, error: "ID de producto invalido." };
    }
    const key = String(campo ?? "").trim();
    if (!key) {
      return { ok: false, error: "Campo vacio." };
    }
    if (key === "id") {
      return { ok: false, error: "El campo id es solo lectura." };
    }

    const patch: Record<string, unknown> = { [key]: valor };
    const actualizado = await updateWooProductPartial(productId, patch);
    return { ok: true, valor: actualizado[key] };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo actualizar en Woo.",
    };
  }
}

export async function actualizarCamposWooProductoAction(
  productId: number,
  patch: Record<string, unknown>,
): Promise<ResultadoActualizarCamposWoo> {
  try {
    await requireAdminActor();

    if (!Number.isFinite(productId) || productId <= 0) {
      return { ok: false, error: "ID de producto invalido." };
    }
    if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) {
      return { ok: false, error: "No hay cambios de Woo para guardar." };
    }
    if ("id" in patch) {
      return { ok: false, error: "El campo id es solo lectura." };
    }

    const actualizado = await updateWooProductPartial(productId, patch);
    return { ok: true, producto: actualizado };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo actualizar en Woo.",
    };
  }
}

export type DatosB2BProducto = {
  precio_mayorista: number;
  precio_costo: number;
  compra_minima: number;
};

export type ResultadoActualizarCampoB2B =
  | { ok: true; datos: DatosB2BProducto }
  | { ok: false; error: string };

export type ResultadoActualizarProveedorProducto =
  | { ok: true; proveedor_id: string | null }
  | { ok: false; error: string };

function clampNumeroNoNegativo(raw: unknown, fallback: number) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return fallback;
  }
  return n;
}

type FilaPM = {
  precio_venta?: number | null;
  precio_costo?: number | null;
  escalas_volumen?: unknown;
  nombre?: string | null;
  sku?: string | null;
};

function compraMinimaDesdeEscalas(escalas: unknown): number {
  if (!Array.isArray(escalas) || escalas.length === 0) {
    return 1;
  }
  const primera = escalas[0] as { cantidad_minima?: unknown } | null;
  const n = Number(primera?.cantidad_minima);
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return Math.floor(n);
}

export async function actualizarCampoB2BProductoAction(
  productId: number,
  campo: "precio_costo" | "precio_mayorista" | "compra_minima",
  valor: unknown,
): Promise<ResultadoActualizarCampoB2B> {
  try {
    const { actorId } = await requireAdminActor();
    if (!Number.isFinite(productId) || productId <= 0) {
      return { ok: false, error: "ID de producto invalido." };
    }

    const supabase = getSupabaseAdmin();
    const { data: cacheData } = await supabase
      .from("woo_product_cache")
      .select("name, sku")
      .eq("woo_product_id", productId)
      .maybeSingle();

    const nombreCache = String((cacheData as { name?: string } | null)?.name ?? "").trim();
    const skuCache = ((cacheData as { sku?: string | null } | null)?.sku ?? null) as string | null;

    const { data: pmData, error: pmError } = await supabase
      .from("productos_mayoristas")
      .select("woo_product_id, nombre, sku, precio_venta, precio_costo, escalas_volumen")
      .eq("woo_product_id", productId)
      .maybeSingle();

    const tablaNoExiste =
      pmError?.message?.includes("Could not find the table 'public.productos_mayoristas'") ?? false;

    if (pmError && !tablaNoExiste) {
      return { ok: false, error: pmError.message };
    }

    if (!tablaNoExiste) {
      const actual = (pmData as FilaPM | null) ?? null;
      const precioVentaBase = clampNumeroNoNegativo(actual?.precio_venta, 0);
      const precioCostoBase = clampNumeroNoNegativo(actual?.precio_costo, 0);
      const compraMinBase = compraMinimaDesdeEscalas(actual?.escalas_volumen);

      const nuevoPrecioVenta =
        campo === "precio_mayorista"
          ? Number(clampNumeroNoNegativo(valor, precioVentaBase).toFixed(2))
          : Number(precioVentaBase.toFixed(2));
      const nuevoPrecioCosto =
        campo === "precio_costo"
          ? Number(clampNumeroNoNegativo(valor, precioCostoBase).toFixed(2))
          : Number(precioCostoBase.toFixed(2));
      const nuevaCompraMinima =
        campo === "compra_minima"
          ? Math.max(1, Math.floor(clampNumeroNoNegativo(valor, compraMinBase)))
          : compraMinBase;

      const escalas = Array.isArray(actual?.escalas_volumen)
        ? [...(actual?.escalas_volumen as Array<Record<string, unknown>>)]
        : [];

      if (escalas.length > 0) {
        escalas[0] = {
          ...escalas[0],
          cantidad_minima: nuevaCompraMinima,
          precio: clampNumeroNoNegativo(escalas[0]?.precio, nuevoPrecioVenta),
        };
      } else {
        escalas.push({ cantidad_minima: nuevaCompraMinima, precio: nuevoPrecioVenta });
      }

      const payload = {
        woo_product_id: productId,
        nombre: (actual?.nombre ?? "").trim() || nombreCache || `Producto #${productId}`,
        sku: actual?.sku ?? skuCache,
        precio_venta: nuevoPrecioVenta,
        precio_costo: nuevoPrecioCosto,
        escalas_volumen: escalas,
      };

      const { error: upsertError } = await supabase
        .from("productos_mayoristas")
        .upsert(payload, { onConflict: "woo_product_id" });

      if (upsertError) {
        return { ok: false, error: upsertError.message };
      }

      if (campo === "precio_costo" && Number(precioCostoBase.toFixed(2)) !== nuevoPrecioCosto) {
        const { error: historialError } = await supabase.from("historial_costos_productos").insert({
          woo_product_id: productId,
          costo_anterior: Number(precioCostoBase.toFixed(2)),
          costo_nuevo: nuevoPrecioCosto,
          modificado_por: actorId,
        });

        if (historialError) {
          return { ok: false, error: historialError.message };
        }
      }

      return {
        ok: true,
        datos: {
          precio_mayorista: nuevoPrecioVenta,
          precio_costo: nuevoPrecioCosto,
          compra_minima: nuevaCompraMinima,
        },
      };
    }

    // Fallback legado: wholesale_products
    const { data: wpData, error: wpError } = await supabase
      .from("wholesale_products")
      .select("woo_product_id, name, sku, custom_price, precio_costo, min_quantity")
      .eq("woo_product_id", productId)
      .maybeSingle();

    if (wpError) {
      return { ok: false, error: wpError.message };
    }

    const actualWp = (wpData as {
      name?: string | null;
      sku?: string | null;
      custom_price?: number | null;
      precio_costo?: number | null;
      min_quantity?: number | null;
    } | null) ?? { custom_price: 0, precio_costo: 0, min_quantity: 1 };

    const precioVentaBase = clampNumeroNoNegativo(actualWp.custom_price, 0);
    const precioCostoBase = clampNumeroNoNegativo(actualWp.precio_costo, 0);
    const compraMinBase = Math.max(1, Math.floor(clampNumeroNoNegativo(actualWp.min_quantity, 1)));

    const nuevoPrecioVenta =
      campo === "precio_mayorista"
        ? Number(clampNumeroNoNegativo(valor, precioVentaBase).toFixed(2))
        : Number(precioVentaBase.toFixed(2));
    const nuevoPrecioCosto =
      campo === "precio_costo"
        ? Number(clampNumeroNoNegativo(valor, precioCostoBase).toFixed(2))
        : Number(precioCostoBase.toFixed(2));
    const nuevaCompraMinima =
      campo === "compra_minima"
        ? Math.max(1, Math.floor(clampNumeroNoNegativo(valor, compraMinBase)))
        : compraMinBase;

    const payload: Record<string, unknown> = {
      woo_product_id: productId,
      name: (actualWp.name ?? "").trim() || nombreCache || `Producto #${productId}`,
      sku: actualWp.sku ?? skuCache,
      custom_price: nuevoPrecioVenta,
      precio_costo: nuevoPrecioCosto,
      min_quantity: nuevaCompraMinima,
    };
    const { error: upsertWpError } = await supabase
      .from("wholesale_products")
      .upsert(payload, { onConflict: "woo_product_id" });

    if (upsertWpError) {
      return { ok: false, error: upsertWpError.message };
    }

    if (campo === "precio_costo" && Number(precioCostoBase.toFixed(2)) !== nuevoPrecioCosto) {
      const { error: historialError } = await supabase.from("historial_costos_productos").insert({
        woo_product_id: productId,
        costo_anterior: Number(precioCostoBase.toFixed(2)),
        costo_nuevo: nuevoPrecioCosto,
        modificado_por: actorId,
      });
      if (historialError) {
        return { ok: false, error: historialError.message };
      }
    }

    return {
      ok: true,
      datos: {
        precio_mayorista: nuevoPrecioVenta,
        precio_costo: nuevoPrecioCosto,
        compra_minima: nuevaCompraMinima,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo actualizar B2B.",
    };
  }
}

export async function actualizarProveedorProductoAction(
  productId: number,
  proveedorId: string | null,
): Promise<ResultadoActualizarProveedorProducto> {
  try {
    await requireAdminActor();
    if (!Number.isFinite(productId) || productId <= 0) {
      return { ok: false, error: "ID de producto inválido." };
    }
    const proveedorNormalizado = proveedorId && proveedorId.trim().length > 0 ? proveedorId.trim() : null;
    await upsertProveedorProducto(getSupabaseAdmin(), productId, proveedorNormalizado);
    return { ok: true, proveedor_id: proveedorNormalizado };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo actualizar el proveedor.",
    };
  }
}

export type ResultadoSerieRentabilidadWebProducto =
  | { ok: true; puntos: PuntoSerieRentabilidadWebProducto[]; truncado: boolean }
  | { ok: false; error: string };

/**
 * Pedidos Woo en rango + agregación diaria por producto (ingresos/unidades).
 * La ganancia por día se puede derivar en cliente: ingresos − unidades × costo.
 */
export async function cargarSerieRentabilidadWebProductoAction(
  productId: number,
  desde: string,
  hasta: string,
): Promise<ResultadoSerieRentabilidadWebProducto> {
  try {
    await requireAdminActor();

    if (!Number.isFinite(productId) || productId <= 0) {
      return { ok: false, error: "ID de producto invalido." };
    }
    const desdeTrim = String(desde ?? "").trim();
    const hastaTrim = String(hasta ?? "").trim();
    if (desdeTrim.length !== 10 || hastaTrim.length !== 10) {
      return { ok: false, error: "Rango de fechas invalido (usar YYYY-MM-DD)." };
    }
    if (desdeTrim > hastaTrim) {
      return { ok: false, error: "La fecha inicial no puede ser posterior a la final." };
    }

    const { afterIso, beforeIso } = construirRangoIsoGmt(desdeTrim, hastaTrim);
    const { orders, truncado } = await fetchWooOrdersInDateRange({
      afterIso,
      beforeIso,
      maxPages: 100,
    });

    const puntos = serieIngresosUnidadesProductoPorDia(orders, productId);
    return { ok: true, puntos, truncado };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo cargar la serie de rentabilidad.",
    };
  }
}

export type ResultadoSerieCostoHistorialProducto =
  | { ok: true; puntos: PuntoSerieCostoDia[] }
  | { ok: false; error: string };

async function leerPrecioCostoProductoSupabase(productId: number): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data: pmData, error: pmError } = await supabase
    .from("productos_mayoristas")
    .select("precio_costo")
    .eq("woo_product_id", productId)
    .maybeSingle();

  const tablaNoExistePm =
    pmError?.message?.includes("Could not find the table 'public.productos_mayoristas'") ?? false;

  if (!pmError || !tablaNoExistePm) {
    if (pmError) {
      throw new Error(pmError.message);
    }
    return Number((pmData as { precio_costo?: number | null } | null)?.precio_costo ?? 0);
  }

  const { data: wpData, error: wpError } = await supabase
    .from("wholesale_products")
    .select("precio_costo")
    .eq("woo_product_id", productId)
    .maybeSingle();

  if (wpError && !wpError.message.includes("Could not find the table")) {
    throw new Error(wpError.message);
  }

  return Number((wpData as { precio_costo?: number | null } | null)?.precio_costo ?? 0);
}

/**
 * Costo diario en el rango según `historial_costos_productos` (escalones). Sin tabla o sin filas: costo plano actual.
 */
export async function cargarSerieCostoProductoHistorialAction(
  productId: number,
  desde: string,
  hasta: string,
): Promise<ResultadoSerieCostoHistorialProducto> {
  try {
    await requireAdminActor();

    if (!Number.isFinite(productId) || productId <= 0) {
      return { ok: false, error: "ID de producto invalido." };
    }
    const desdeTrim = String(desde ?? "").trim();
    const hastaTrim = String(hasta ?? "").trim();
    if (desdeTrim.length !== 10 || hastaTrim.length !== 10) {
      return { ok: false, error: "Rango de fechas invalido (usar YYYY-MM-DD)." };
    }
    if (desdeTrim > hastaTrim) {
      return { ok: false, error: "La fecha inicial no puede ser posterior a la final." };
    }

    const costoActual = await leerPrecioCostoProductoSupabase(productId);
    const supabase = getSupabaseAdmin();
    const { data: filas, error: histError } = await supabase
      .from("historial_costos_productos")
      .select("costo_anterior, costo_nuevo, fecha_modificacion")
      .eq("woo_product_id", productId)
      .order("fecha_modificacion", { ascending: true });

    const msg = histError?.message ?? "";
    const tablaHistorialNoExiste =
      msg.includes("Could not find the relation") ||
      msg.includes("Could not find the table") ||
      msg.includes("does not exist");

    if (histError && !tablaHistorialNoExiste) {
      return { ok: false, error: histError.message };
    }

    const historial: FilaHistorialCostoProducto[] = tablaHistorialNoExiste
      ? []
      : ((filas ?? []) as FilaHistorialCostoProducto[]).map((r) => ({
          costo_anterior: Number(r.costo_anterior),
          costo_nuevo: Number(r.costo_nuevo),
          fecha_modificacion: String(r.fecha_modificacion),
        }));

    const puntos = serieCostoEfectivoPorDia(desdeTrim, hastaTrim, historial, costoActual);
    return { ok: true, puntos };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo cargar el historial de costos.",
    };
  }
}
