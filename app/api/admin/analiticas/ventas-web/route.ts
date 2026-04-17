import { NextResponse } from "next/server";

import { resolverRangoFechasAnaliticasDesdeQuery } from "@/lib/analiticas-rango-fechas-utc";
import { cargarAnaliticasVentasWeb } from "@/lib/analiticas-ventas-web-data";
import { idsCategoriaMasDescendientes } from "@/lib/inventario-categorias";
import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type FilaCategoriaCache = {
  woo_term_id: number;
  nombre: string;
  id_padre: number;
};

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ ok: false as const, error: auth.message }, { status: auth.status });
  }

  const url = new URL(request.url);
  const desdeParam = url.searchParams.get("desde") ?? undefined;
  const hastaParam = url.searchParams.get("hasta") ?? undefined;
  const acategoriaRaw = url.searchParams.get("acategoria") ?? "";

  const rango = resolverRangoFechasAnaliticasDesdeQuery(desdeParam, hastaParam);
  const supabaseAdmin = getSupabaseAdmin();

  const { data: datosCats, error: errorCats } = await supabaseAdmin
    .from("woo_category_cache")
    .select("woo_term_id, nombre, id_padre")
    .order("nombre", { ascending: true });

  let filasCategorias: FilaCategoriaCache[] = [];
  if (errorCats) {
    const tablaAusente =
      errorCats.message.includes("Could not find the table") ||
      errorCats.message.includes("schema cache");
    if (!tablaAusente) {
      return NextResponse.json({ ok: false as const, error: errorCats.message }, { status: 500 });
    }
  } else {
    filasCategorias = (datosCats as FilaCategoriaCache[]) ?? [];
  }

  const idAcategoria = Number.parseInt(String(acategoriaRaw), 10);
  let idsCategoriaFiltro: number[] | null = null;
  let categoriaFiltroEtiqueta: string | null = null;
  if (Number.isFinite(idAcategoria) && idAcategoria > 0) {
    idsCategoriaFiltro = idsCategoriaMasDescendientes(idAcategoria, filasCategorias);
    const filaSel = filasCategorias.find((c) => c.woo_term_id === idAcategoria);
    categoriaFiltroEtiqueta = filaSel?.nombre ?? `Categoría #${idAcategoria}`;
  }

  const carga = await cargarAnaliticasVentasWeb(supabaseAdmin, rango.desde, rango.hasta, {
    idsCategoriaFiltro,
  });

  if (!carga.ok) {
    return NextResponse.json({
      ok: false as const,
      error: carga.error,
      desde: rango.desde,
      hasta: rango.hasta,
    });
  }

  return NextResponse.json({
    ok: true as const,
    datos: carga.datos,
    desde: rango.desde,
    hasta: rango.hasta,
    categoriaFiltroEtiqueta,
  });
}
