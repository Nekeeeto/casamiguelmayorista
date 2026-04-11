import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  acumularHealthGlobal,
  type FilaCategoriaHealth,
  type FilaInventarioHealthInput,
} from "@/lib/inventory-health-evaluate";
import {
  armarIdsFiltroCategorias,
  type FilaCategoriaInventarioAdmin,
} from "@/lib/inventario-admin-data";
import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const PAGE = 1000;

type MapaMayoristaHealth = Map<
  number,
  { precio_costo: number | null | undefined; proveedor_id: string | null | undefined }
>;

async function cargarMapaMayorista(supabaseAdmin: SupabaseClient): Promise<MapaMayoristaHealth> {
  const map: MapaMayoristaHealth = new Map();

  async function paginarTabla(tabla: string, columnas: string) {
    let from = 0;
    for (;;) {
      const { data, error } = await supabaseAdmin
        .from(tabla)
        .select(columnas)
        .order("woo_product_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        throw new Error(error.message);
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      if (rows.length === 0) {
        break;
      }
      for (const row of rows) {
        const id = row.woo_product_id as number;
        map.set(id, {
          precio_costo: (row.precio_costo as number | null | undefined) ?? null,
          proveedor_id: (row.proveedor_id as string | null | undefined) ?? null,
        });
      }
      if (rows.length < PAGE) {
        break;
      }
      from += PAGE;
    }
  }

  type Probe = { data: unknown; error: { message: string } | null };
  const probar = async (tabla: string, cols: string) =>
    (await supabaseAdmin.from(tabla).select(cols).limit(1)) as Probe;

  const intentosPm = ["woo_product_id, precio_costo, proveedor_id", "woo_product_id, precio_costo"];

  for (const cols of intentosPm) {
    const probe = await probar("productos_mayoristas", cols);
    if (probe.error) {
      if (probe.error.message.includes("Could not find the table")) {
        break;
      }
      continue;
    }
    await paginarTabla("productos_mayoristas", cols);
    return map;
  }

  const intentosWh = ["woo_product_id, precio_costo, proveedor_id", "woo_product_id, precio_costo"];

  for (const cols of intentosWh) {
    const probe = await probar("wholesale_products", cols);
    if (probe.error) {
      continue;
    }
    let from = 0;
    for (;;) {
      const { data, error } = await supabaseAdmin
        .from("wholesale_products")
        .select(cols)
        .order("woo_product_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        throw new Error(error.message);
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      if (rows.length === 0) {
        break;
      }
      for (const row of rows) {
        const id = row.woo_product_id as number;
        map.set(id, {
          precio_costo: (row.precio_costo as number | null | undefined) ?? null,
          proveedor_id: (row.proveedor_id as string | null | undefined) ?? null,
        });
      }
      if (rows.length < PAGE) {
        break;
      }
      from += PAGE;
    }
    return map;
  }

  return map;
}

async function columnasCacheDisponibles(supabaseAdmin: SupabaseClient): Promise<{
  categoriaIds: boolean;
  stock: boolean;
}> {
  let categoriaIds = true;
  let stock = true;
  const p1 = await supabaseAdmin.from("woo_product_cache").select("woo_product_id, categoria_ids").limit(1);
  if (p1.error?.message.includes("categoria_ids")) {
    categoriaIds = false;
  }
  const p2 = await supabaseAdmin
    .from("woo_product_cache")
    .select("woo_product_id, stock_quantity, stock_status")
    .limit(1);
  if (
    p2.error?.message.includes("stock_quantity") ||
    p2.error?.message.includes("stock_status")
  ) {
    stock = false;
  }
  return { categoriaIds, stock };
}

function armarSelectCache(opts: { categoriaIds: boolean; stock: boolean }) {
  const partes = ["woo_product_id", "sku"];
  if (opts.categoriaIds) partes.push("categoria_ids");
  if (opts.stock) partes.push("stock_status", "stock_quantity");
  return partes.join(", ");
}

function productoEnIdsCategoria(
  categoriaIds: number[],
  idsFiltro: Set<number>,
): boolean {
  if (idsFiltro.size === 0) return false;
  for (const id of categoriaIds) {
    if (idsFiltro.has(Number(id))) return true;
  }
  return false;
}

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false as const, error: auth.message },
      { status: auth.status },
    );
  }

  const url = new URL(request.url);
  const categoriaParam = url.searchParams.get("categoria") ?? "";
  const subcategoriaParam = url.searchParams.get("subcategoria") ?? "";

  const supabaseAdmin = getSupabaseAdmin();

  const { data: datosCategorias, error: errorCategorias } = await supabaseAdmin
    .from("woo_category_cache")
    .select("woo_term_id, id_padre")
    .order("woo_term_id", { ascending: true });

  if (errorCategorias) {
    return NextResponse.json(
      { ok: false as const, error: errorCategorias.message },
      { status: 500 },
    );
  }

  const filasCat = (datosCategorias as FilaCategoriaInventarioAdmin[]) ?? [];
  const categoriasHealth: FilaCategoriaHealth[] = filasCat.map((c) => ({
    woo_term_id: c.woo_term_id,
    id_padre: c.id_padre,
  }));

  try {
    const mapaMayorista = await cargarMapaMayorista(supabaseAdmin);
    const optsCache = await columnasCacheDisponibles(supabaseAdmin);
    const selectCache = armarSelectCache(optsCache);

    const filasHealth: FilaInventarioHealthInput[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await supabaseAdmin
        .from("woo_product_cache")
        .select(selectCache)
        .order("woo_product_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json(
          { ok: false as const, error: error.message },
          { status: 500 },
        );
      }
      const rows = (data ?? []) as unknown as Array<{
        woo_product_id: number;
        sku: string | null;
        categoria_ids?: number[] | null;
        stock_status?: string | null;
        stock_quantity?: number | null;
      }>;
      if (rows.length === 0) {
        break;
      }
      for (const row of rows) {
        const pm = mapaMayorista.get(row.woo_product_id);
        filasHealth.push({
          woo_product_id: row.woo_product_id,
          sku: row.sku,
          stock_status: optsCache.stock ? row.stock_status : undefined,
          stock_quantity: optsCache.stock ? row.stock_quantity : undefined,
          categoria_ids: optsCache.categoriaIds
            ? Array.isArray(row.categoria_ids)
              ? row.categoria_ids
              : []
            : [],
          precio_costo: pm ? pm.precio_costo : undefined,
          proveedor_id: pm ? pm.proveedor_id : undefined,
        });
      }
      if (rows.length < PAGE) {
        break;
      }
      from += PAGE;
    }

    const agregadoGlobal = acumularHealthGlobal(filasHealth, categoriasHealth);
    const idsFiltroLista = armarIdsFiltroCategorias(filasCat, categoriaParam, subcategoriaParam);
    const idsFiltroSet = new Set(idsFiltroLista);

    let totals = agregadoGlobal.totals;
    if (idsFiltroSet.size > 0) {
      const filasScope = filasHealth.filter((fila) =>
        productoEnIdsCategoria(fila.categoria_ids ?? [], idsFiltroSet),
      );
      totals = acumularHealthGlobal(filasScope, categoriasHealth).totals;
    }

    return NextResponse.json({
      ok: true as const,
      totals,
      byRootCategory: agregadoGlobal.byRootCategory,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error al calcular salud del inventario.";
    return NextResponse.json({ ok: false as const, error: mensaje }, { status: 500 });
  }
}
