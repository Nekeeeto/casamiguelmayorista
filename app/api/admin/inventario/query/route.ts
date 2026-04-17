import { NextResponse } from "next/server";

import type { ProductoInventarioFila } from "@/components/admin/inventario-tabla-productos";
import {
  cargarInventarioAdminPagina,
  parseAlertasInventarioParam,
  type FilaCategoriaInventarioAdmin,
  type ProductoCacheInventarioAdmin,
  type ProductoMayoristaInventarioAdmin,
} from "@/lib/inventario-admin-data";
import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 1000;

function resolverTamanoPagina(raw: string | null) {
  if (raw === "50") return { key: "50" as const, value: 50 };
  if (raw === "100") return { key: "100" as const, value: 100 };
  if (raw === "max") return { key: "max" as const, value: PAGE_SIZE_MAXIMO };
  return { key: "20" as const, value: PAGE_SIZE_DEFAULT };
}

type ProveedorInventarioOpcion = {
  id: string;
  nombre_fantasia: string;
  logo_url: string | null;
};

function fusionarParaTabla(
  cacheRows: ProductoCacheInventarioAdmin[],
  productosMayoristas: ProductoMayoristaInventarioAdmin[],
): ProductoInventarioFila[] {
  const mayoristaPorId = new Map(
    productosMayoristas.map((producto) => [producto.woo_product_id, producto]),
  );
  return cacheRows.map((producto) => {
    const mayorista = mayoristaPorId.get(producto.woo_product_id);
    return {
      woo_product_id: producto.woo_product_id,
      name: producto.name,
      sku: producto.sku,
      base_price: producto.base_price,
      ventas_web: producto.ventas_web,
      categoria_ids: producto.categoria_ids ?? [],
      status: producto.status,
      image_url: producto.image_url,
      stock_status: producto.stock_status,
      manage_stock: producto.manage_stock,
      stock_quantity: producto.stock_quantity,
      mayorista: mayorista
        ? {
            precio_venta: mayorista.precio_venta,
            precio_costo: mayorista.precio_costo,
            ventas_mayorista: mayorista.ventas_mayorista,
            activo: mayorista.activo,
            proveedor_id: mayorista.proveedor_id ?? null,
          }
        : null,
    };
  });
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
  const pagina = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const categoria = url.searchParams.get("categoria") ?? "";
  const subcategoria = url.searchParams.get("subcategoria") ?? "";
  const mayoristaRaw = url.searchParams.get("mayorista") ?? "";
  const mayoristaParam = mayoristaRaw === "si" || mayoristaRaw === "no" ? mayoristaRaw : "";
  const ordenParam = url.searchParams.get("orden") === "ventas_web" ? "ventas_web" : "woo_id";
  const pageSize = resolverTamanoPagina(url.searchParams.get("pageSize"));
  const qParam = url.searchParams.get("q") ?? "";
  const alertasFiltro = parseAlertasInventarioParam(url.searchParams.get("alertas"));

  const supabaseAdmin = getSupabaseAdmin();
  const { data: datosCategorias, error: errorCategorias } = await supabaseAdmin
    .from("woo_category_cache")
    .select("woo_term_id, nombre, id_padre")
    .order("nombre", { ascending: true });

  if (errorCategorias) {
    return NextResponse.json(
      { ok: false as const, error: errorCategorias.message },
      { status: 500 },
    );
  }

  const filasCategoriasWoo = (datosCategorias as FilaCategoriaInventarioAdmin[]) ?? [];

  try {
    let proveedores: ProveedorInventarioOpcion[] = [];
    const { data: proveedoresData, error: proveedoresError } = await supabaseAdmin
      .from("proveedores")
      .select("id, nombre_fantasia, logo_url")
      .order("nombre_fantasia", { ascending: true });
    if (proveedoresError && !proveedoresError.message.includes("Could not find the table")) {
      return NextResponse.json(
        { ok: false as const, error: proveedoresError.message },
        { status: 500 },
      );
    }
    if (!proveedoresError) {
      proveedores =
        ((proveedoresData ?? []) as Array<{
          id: string;
          nombre_fantasia: string;
          logo_url: string | null;
        }>).map((fila) => ({
          id: fila.id,
          nombre_fantasia: fila.nombre_fantasia,
          logo_url: fila.logo_url ?? null,
        })) ?? [];
    }

    const resultado = await cargarInventarioAdminPagina(supabaseAdmin, {
      filasCategoriasWoo,
      categoriaParam: categoria,
      subcategoriaParam: subcategoria,
      mayoristaParam,
      ordenParam,
      pagina,
      tamanoPagina: pageSize.value,
      qParam,
      alertasFiltro,
    });

    const productos = fusionarParaTabla(resultado.cacheRows, resultado.productosMayoristas);

    return NextResponse.json({
      ok: true as const,
      productos,
      total: resultado.total,
      totalPages: resultado.totalPages,
      page: pagina,
      pageSize: pageSize.key,
      inicioRango: resultado.inicioRango,
      proveedores,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error al cargar inventario.";
    return NextResponse.json({ ok: false as const, error: mensaje }, { status: 500 });
  }
}
