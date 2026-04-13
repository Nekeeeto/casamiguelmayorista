import type { SupabaseClient } from "@supabase/supabase-js";

import { idsCategoriaMasDescendientes } from "@/lib/inventario-categorias";
import { fetchWooProductById, updateWooProductPartial } from "@/lib/woo";

/** Slugs de categoría Woo a excluir con todo su árbol (hijos). */
export const OFERTAS_SEMANALES_SLUGS_EXCLUIDOS = ["pirotecnia", "estadio"] as const;

export type OfertaSemanalDetalle = {
  woo_product_id: number;
  nombre: string;
  precio_regular: number;
  precio_oferta: number;
  porcentaje_descuento: number;
  precio_costo: number;
  ventas_historicas: number;
  razon: string;
};

export type WeeklyOffersStateRow = {
  singleton: string;
  woo_product_ids: number[];
  ofertas_detalle: OfertaSemanalDetalle[];
  narrativa_resumen: string;
  rotated_at: string | null;
  week_ends_at: string | null;
};

type CategoriaFila = { woo_term_id: number; slug: string; id_padre: number };

type ProductoMayoristaFila = {
  woo_product_id: number;
  precio_costo: number;
  nombre: string;
  activo: boolean | null;
};

type WooCacheFila = {
  woo_product_id: number;
  name: string;
  base_price: number;
  categoria_ids: number[] | null;
  ventas_web: number | null;
  stock_status: string | null;
  status: string | null;
};

function normalizarSlug(raw: string) {
  return raw.trim().toLowerCase();
}

export function idsCategoriasExcluidasOfertasSemanales(categorias: CategoriaFila[]): Set<number> {
  const prohibidos = new Set<number>();
  const arbol = categorias.map((c) => ({
    woo_term_id: Number(c.woo_term_id),
    id_padre: Number(c.id_padre),
  }));

  for (const slugEx of OFERTAS_SEMANALES_SLUGS_EXCLUIDOS) {
    const cat = categorias.find((c) => normalizarSlug(c.slug) === slugEx);
    if (!cat) continue;
    const raiz = Number(cat.woo_term_id);
    for (const id of idsCategoriaMasDescendientes(raiz, arbol)) {
      prohibidos.add(id);
    }
  }

  return prohibidos;
}

function parsePrecioWoo(raw: unknown): number {
  if (raw == null) return 0;
  const n = Number.parseFloat(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function redondearPrecioUruguay(valor: number) {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return Math.max(1, Math.floor(valor / 10) * 10);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export type CalcularSeleccionOfertasResultado =
  | { ok: true; detalle: OfertaSemanalDetalle[]; narrativa_resumen: string }
  | { ok: false; error: string };

/**
 * Heurística determinista (sin LLM): prioriza menor `ventas_web` (total histórico Woo)
 * entre productos con costo conocido (>0), margen razonable y fuera de Pirotecnía/Estadio.
 */
export function calcularSeleccionOfertasSemanales(input: {
  categorias: CategoriaFila[];
  mayoristas: ProductoMayoristaFila[];
  cache: WooCacheFila[];
}): CalcularSeleccionOfertasResultado {
  const prohibidos = idsCategoriasExcluidasOfertasSemanales(input.categorias);

  const porWooId = new Map<number, WooCacheFila>();
  for (const fila of input.cache) {
    porWooId.set(Number(fila.woo_product_id), fila);
  }

  type Cand = {
    woo_product_id: number;
    nombre: string;
    basePrice: number;
    cost: number;
    ventas: number;
    margin: number;
    cats: number[];
  };

  const candidatos: Cand[] = [];

  for (const pm of input.mayoristas) {
    if (pm.activo === false) continue;
    const cost = Number(pm.precio_costo);
    if (!Number.isFinite(cost) || cost <= 0) continue;

    const p = porWooId.get(Number(pm.woo_product_id));
    if (!p) continue;
    if (String(p.status ?? "publish").toLowerCase() !== "publish") continue;
    const stock = String(p.stock_status ?? "instock").toLowerCase();
    if (stock === "outofstock") continue;

    const cats = Array.isArray(p.categoria_ids) ? p.categoria_ids.map(Number) : [];
    if (cats.some((id) => prohibidos.has(id))) continue;

    const basePrice = Number(p.base_price);
    if (!Number.isFinite(basePrice) || basePrice <= 0) continue;
    if (basePrice <= cost) continue;

    const margin = (basePrice - cost) / basePrice;
    if (!Number.isFinite(margin) || margin < 0.1) continue;

    const ventas = Math.max(0, Math.trunc(Number(p.ventas_web ?? 0)));

    candidatos.push({
      woo_product_id: Number(pm.woo_product_id),
      nombre: String(p.name || pm.nombre || `Producto #${pm.woo_product_id}`),
      basePrice,
      cost,
      ventas,
      margin,
      cats,
    });
  }

  if (candidatos.length < 4) {
    return {
      ok: false,
      error:
        "No hay al menos 4 productos elegibles (publicados, con stock, costo > 0, margen ≥10% y fuera de Pirotecnía/Estadio). Sincronizá el catálogo y revisá costos en inventario.",
    };
  }

  const minMargen = 0.12;
  let pool = candidatos.filter((c) => c.margin >= minMargen);
  if (pool.length < 4) {
    pool = candidatos.filter((c) => c.margin >= 0.1);
  }

  pool.sort((a, b) => {
    if (a.ventas !== b.ventas) return a.ventas - b.ventas;
    return b.margin - a.margin;
  });

  const targetN = Math.min(10, Math.max(4, Math.min(10, pool.length)));
  const elegidos = pool.slice(0, targetN);

  const detalle: OfertaSemanalDetalle[] = [];

  for (const c of elegidos) {
    const descuentoObjetivo = clamp(c.margin * 0.82, 0.08, 0.34);
    let oferta = redondearPrecioUruguay(c.basePrice * (1 - descuentoObjetivo));
    const piso = redondearPrecioUruguay(c.cost * 1.08);
    if (oferta <= piso) {
      oferta = Math.min(redondearPrecioUruguay(c.basePrice * 0.92), Math.max(piso + 10, piso));
    }
    if (oferta >= c.basePrice) {
      oferta = redondearPrecioUruguay(c.basePrice * 0.9);
    }

    const pct = Math.round(((c.basePrice - oferta) / c.basePrice) * 100);

    const razon =
      `Menor rotación histórica en Woo (≈${c.ventas} u. según total_sales) respecto de otros candidatos con costo cargado; ` +
      `margen bruto ~${(c.margin * 100).toFixed(0)}% sobre precio cacheado; ` +
      `se propone oferta ~${pct}% manteniendo precio por encima del costo + margen de seguridad. ` +
      `Excluidas categorías Pirotecnía y Estadio (slugs ${[...OFERTAS_SEMANALES_SLUGS_EXCLUIDOS].join(", ")}).`;

    detalle.push({
      woo_product_id: c.woo_product_id,
      nombre: c.nombre,
      precio_regular: Number(c.basePrice.toFixed(2)),
      precio_oferta: oferta,
      porcentaje_descuento: pct,
      precio_costo: Number(c.cost.toFixed(2)),
      ventas_historicas: c.ventas,
      razon,
    });
  }

  const descMin = Math.min(...detalle.map((d) => d.porcentaje_descuento));
  const descMax = Math.max(...detalle.map((d) => d.porcentaje_descuento));

  const slugsPresentes = OFERTAS_SEMANALES_SLUGS_EXCLUIDOS.filter((slug) =>
    input.categorias.some((c) => normalizarSlug(c.slug) === slug),
  );
  const slugsFaltantes = OFERTAS_SEMANALES_SLUGS_EXCLUIDOS.filter((s) => !slugsPresentes.includes(s));

  const narrativa_resumen =
    `Selección automática (${detalle.length} ítems, mín. 4 máx. 10). ` +
    `Criterios: productos publicados con stock, costo mayor a 0 en productos_mayoristas, margen suficiente, ` +
    `ordenados priorizando bajas ventas históricas (total_sales en Woo vía caché) y mejor margen como desempate. ` +
    `Descuentos mostrados entre ~${descMin}% y ~${descMax}%. ` +
    `Se intentó excluir ramas de categoría «pirotecnia» y «estadio» (incluye subcategorías).` +
    (slugsFaltantes.length
      ? ` Advertencia: en caché no aparecen estas slugs: ${slugsFaltantes.join(", ")} — conviene sincronizar categorías Woo.`
      : "");

  return { ok: true, detalle, narrativa_resumen };
}

export async function leerEstadoOfertasSemanales(
  supabase: SupabaseClient,
): Promise<WeeklyOffersStateRow | null> {
  const { data, error } = await supabase
    .from("weekly_offers_state")
    .select("singleton, woo_product_ids, ofertas_detalle, narrativa_resumen, rotated_at, week_ends_at")
    .eq("singleton", "default")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const detalleRaw = data.ofertas_detalle;
  const detalle = Array.isArray(detalleRaw)
    ? (detalleRaw as unknown[]).map((x) => x as OfertaSemanalDetalle)
    : [];

  return {
    singleton: String(data.singleton),
    woo_product_ids: (data.woo_product_ids as number[]) ?? [],
    ofertas_detalle: detalle,
    narrativa_resumen: String(data.narrativa_resumen ?? ""),
    rotated_at: data.rotated_at ? String(data.rotated_at) : null,
    week_ends_at: data.week_ends_at ? String(data.week_ends_at) : null,
  };
}

export async function guardarEstadoOfertasSemanales(
  supabase: SupabaseClient,
  payload: {
    woo_product_ids: number[];
    ofertas_detalle: OfertaSemanalDetalle[];
    narrativa_resumen: string;
    rotated_at: string;
    week_ends_at: string;
  },
) {
  const { error } = await supabase.from("weekly_offers_state").upsert(
    {
      singleton: "default",
      woo_product_ids: payload.woo_product_ids,
      ofertas_detalle: payload.ofertas_detalle,
      narrativa_resumen: payload.narrativa_resumen,
      rotated_at: payload.rotated_at,
      week_ends_at: payload.week_ends_at,
    },
    { onConflict: "singleton" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

function sumarDiasIso(iso: string, dias: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString();
}

export async function construirDetalleManualDesdeIds(
  supabase: SupabaseClient,
  items: { woo_product_id: number; precio_oferta?: number; razon?: string }[],
): Promise<{ ok: true; detalle: OfertaSemanalDetalle[] } | { ok: false; error: string }> {
  if (items.length < 4 || items.length > 10) {
    return { ok: false, error: "Indicá entre 4 y 10 productos." };
  }
  const ids = items.map((i) => Math.trunc(Number(i.woo_product_id)));
  if (ids.some((id) => !Number.isFinite(id) || id <= 0)) {
    return { ok: false, error: "Todos los IDs Woo tienen que ser números enteros positivos." };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "No puede haber IDs duplicados." };
  }

  const datos = await cargarDatosParaRotacion(supabase);
  const prohibidos = idsCategoriasExcluidasOfertasSemanales(datos.categorias);
  const pmPorId = new Map<number, ProductoMayoristaFila>();
  for (const pm of datos.mayoristas) {
    pmPorId.set(Number(pm.woo_product_id), pm);
  }
  const cachePorId = new Map<number, WooCacheFila>();
  for (const c of datos.cache) {
    cachePorId.set(Number(c.woo_product_id), c);
  }

  const detalle: OfertaSemanalDetalle[] = [];

  for (let idx = 0; idx < items.length; idx += 1) {
    const id = ids[idx];
    const pm = pmPorId.get(id);
    const p = cachePorId.get(id);
    const entrada = items[idx];

    if (!pm || !p) {
      return {
        ok: false,
        error: `El producto #${id} no está en caché Woo o no tiene costo > 0 en productos_mayoristas.`,
      };
    }
    if (pm.activo === false) {
      return { ok: false, error: `El producto #${id} está inactivo en mayorista.` };
    }
    const cost = Number(pm.precio_costo);
    if (!Number.isFinite(cost) || cost <= 0) {
      return { ok: false, error: `El producto #${id} no tiene costo conocido (>0).` };
    }

    const cats = Array.isArray(p.categoria_ids) ? p.categoria_ids.map(Number) : [];
    if (cats.some((c) => prohibidos.has(c))) {
      return {
        ok: false,
        error: `El producto #${id} pertenece a Pirotecnía o Estadio (excluido de ofertas semanales).`,
      };
    }

    const basePrice = Number(p.base_price);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return { ok: false, error: `El producto #${id} no tiene precio base válido en caché.` };
    }
    if (basePrice <= cost) {
      return { ok: false, error: `El producto #${id} no tiene margen positivo con el costo cargado.` };
    }

    let oferta =
      entrada.precio_oferta != null && Number.isFinite(entrada.precio_oferta)
        ? redondearPrecioUruguay(entrada.precio_oferta)
        : redondearPrecioUruguay(basePrice * 0.85);
    const piso = redondearPrecioUruguay(cost * 1.08);
    if (oferta <= piso) {
      oferta = Math.min(redondearPrecioUruguay(basePrice * 0.92), Math.max(piso + 10, piso));
    }
    if (oferta >= basePrice) {
      oferta = redondearPrecioUruguay(basePrice * 0.9);
    }

    const pct = Math.round(((basePrice - oferta) / basePrice) * 100);
    const razon =
      entrada.razon?.trim() ||
      `Inclusión manual desde el panel (posición ${idx + 1}). Costo cargado UYU ${cost.toFixed(0)}; precio referencia caché UYU ${basePrice.toFixed(0)}; oferta UYU ${oferta} (~${pct}%).`;

    detalle.push({
      woo_product_id: id,
      nombre: String(p.name || pm.nombre || `Producto #${id}`),
      precio_regular: Number(basePrice.toFixed(2)),
      precio_oferta: oferta,
      porcentaje_descuento: pct,
      precio_costo: Number(cost.toFixed(2)),
      ventas_historicas: Math.max(0, Math.trunc(Number(p.ventas_web ?? 0))),
      razon,
    });
  }

  return { ok: true, detalle };
}

export async function cargarDatosParaRotacion(supabase: SupabaseClient) {
  const [catsRes, pmRes, cacheRes] = await Promise.all([
    supabase.from("woo_category_cache").select("woo_term_id, slug, id_padre"),
    supabase
      .from("productos_mayoristas")
      .select("woo_product_id, precio_costo, nombre, activo")
      .gt("precio_costo", 0),
    supabase
      .from("woo_product_cache")
      .select("woo_product_id, name, base_price, categoria_ids, ventas_web, stock_status, status")
      .eq("status", "publish"),
  ]);

  if (catsRes.error) throw new Error(catsRes.error.message);
  if (pmRes.error) throw new Error(pmRes.error.message);
  if (cacheRes.error) throw new Error(cacheRes.error.message);

  return {
    categorias: (catsRes.data ?? []) as CategoriaFila[],
    mayoristas: (pmRes.data ?? []) as ProductoMayoristaFila[],
    cache: (cacheRes.data ?? []) as WooCacheFila[],
  };
}

export type EjecutarRotacionOpciones = {
  supabase: SupabaseClient;
  pushWoo: boolean;
};

export type EjecutarRotacionResultado =
  | { ok: true; estado: WeeklyOffersStateRow }
  | { ok: false; error: string };

export async function ejecutarRotacionOfertasSemanales(
  opts: EjecutarRotacionOpciones,
): Promise<EjecutarRotacionResultado> {
  try {
    const datos = await cargarDatosParaRotacion(opts.supabase);
    const sel = calcularSeleccionOfertasSemanales(datos);
    if (!sel.ok) {
      return { ok: false, error: sel.error };
    }

    const estadoAnterior = await leerEstadoOfertasSemanales(opts.supabase);
    const idsAnteriores = new Set(estadoAnterior?.woo_product_ids ?? []);
    const idsNuevos = new Set(sel.detalle.map((d) => d.woo_product_id));

    const skipWoo = process.env.WEEKLY_OFFERS_SKIP_WOO === "1";
    if (opts.pushWoo && !skipWoo) {
      for (const oldId of idsAnteriores) {
        if (!idsNuevos.has(oldId)) {
          try {
            await updateWooProductPartial(oldId, { sale_price: "" });
          } catch {
            /** Si Woo falla al limpiar, seguimos: la nueva selección puede pisar ofertas viejas. */
          }
        }
      }

      for (const item of sel.detalle) {
        const live = await fetchWooProductById(item.woo_product_id);
        const regular = parsePrecioWoo(live.regular_price) || parsePrecioWoo(live.price);
        if (regular <= 0) {
          return {
            ok: false,
            error: `No se pudo leer precio regular Woo para #${item.woo_product_id}.`,
          };
        }

        let oferta = item.precio_oferta;
        const piso = redondearPrecioUruguay(Number(item.precio_costo) * 1.08);
        if (oferta <= piso) oferta = Math.min(redondearPrecioUruguay(regular * 0.85), Math.max(piso + 10, piso));
        if (oferta >= regular) {
          oferta = redondearPrecioUruguay(regular * 0.9);
        }

        const saleStr = oferta.toFixed(0);
        await updateWooProductPartial(item.woo_product_id, { sale_price: saleStr });

        item.precio_regular = Number(regular.toFixed(2));
        item.precio_oferta = Number(oferta);
        item.porcentaje_descuento = Math.round(((regular - oferta) / regular) * 100);
      }
    }

    const rotatedAt = new Date().toISOString();
    const weekEndsAt = sumarDiasIso(rotatedAt, 7);

    await guardarEstadoOfertasSemanales(opts.supabase, {
      woo_product_ids: sel.detalle.map((d) => d.woo_product_id),
      ofertas_detalle: sel.detalle,
      narrativa_resumen: sel.narrativa_resumen,
      rotated_at: rotatedAt,
      week_ends_at: weekEndsAt,
    });

    const estado = await leerEstadoOfertasSemanales(opts.supabase);
    if (!estado) {
      return { ok: false, error: "No se pudo leer el estado luego de guardar." };
    }
    return { ok: true, estado };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error inesperado en rotación.";
    return { ok: false, error: msg };
  }
}

export async function guardarOfertasManuales(opts: {
  supabase: SupabaseClient;
  pushWoo: boolean;
  detalle: OfertaSemanalDetalle[];
  narrativa_resumen?: string;
}): Promise<EjecutarRotacionResultado> {
  const detalle = opts.detalle;
  if (detalle.length < 4 || detalle.length > 10) {
    return { ok: false, error: "Tenés que indicar entre 4 y 10 productos." };
  }

  const ids = detalle.map((d) => d.woo_product_id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Hay IDs duplicados en la lista." };
  }

  try {
    const estadoAnterior = await leerEstadoOfertasSemanales(opts.supabase);
    const idsAnteriores = new Set(estadoAnterior?.woo_product_ids ?? []);
    const idsNuevos = new Set(ids);

    const skipWoo = process.env.WEEKLY_OFFERS_SKIP_WOO === "1";
    if (opts.pushWoo && !skipWoo) {
      for (const oldId of idsAnteriores) {
        if (!idsNuevos.has(oldId)) {
          try {
            await updateWooProductPartial(oldId, { sale_price: "" });
          } catch {
            /** continuar */
          }
        }
      }

      for (const item of detalle) {
        const live = await fetchWooProductById(item.woo_product_id);
        const regular = parsePrecioWoo(live.regular_price) || parsePrecioWoo(live.price);
        if (regular <= 0) {
          return {
            ok: false,
            error: `No se pudo leer precio regular Woo para #${item.woo_product_id}.`,
          };
        }
        let oferta = redondearPrecioUruguay(item.precio_oferta);
        const piso = redondearPrecioUruguay(Number(item.precio_costo) * 1.08);
        if (oferta <= piso) oferta = Math.min(redondearPrecioUruguay(regular * 0.85), Math.max(piso + 10, piso));
        if (oferta >= regular) {
          oferta = redondearPrecioUruguay(regular * 0.9);
        }
        item.precio_regular = Number(regular.toFixed(2));
        item.precio_oferta = oferta;
        item.porcentaje_descuento = Math.round(((regular - oferta) / regular) * 100);
        await updateWooProductPartial(item.woo_product_id, { sale_price: oferta.toFixed(0) });
      }
    }

    const rotatedAt = new Date().toISOString();
    const weekEndsAt = sumarDiasIso(rotatedAt, 7);
    const narrativa =
      opts.narrativa_resumen?.trim() ||
      "Listado actualizado manualmente desde Herramientas IA (sin recalcular heurística automática).";

    await guardarEstadoOfertasSemanales(opts.supabase, {
      woo_product_ids: ids,
      ofertas_detalle: detalle,
      narrativa_resumen: narrativa,
      rotated_at: rotatedAt,
      week_ends_at: weekEndsAt,
    });

    const estado = await leerEstadoOfertasSemanales(opts.supabase);
    if (!estado) {
      return { ok: false, error: "No se pudo leer el estado luego de guardar." };
    }
    return { ok: true, estado };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar ofertas manuales.";
    return { ok: false, error: msg };
  }
}
