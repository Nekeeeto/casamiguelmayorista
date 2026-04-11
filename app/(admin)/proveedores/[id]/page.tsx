import { notFound } from "next/navigation";

import { AdminDashboardHeader } from "@/components/admin/admin-dashboard-header";
import { ProveedorDetallePanel } from "@/components/admin/proveedor-detalle-panel";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Props = {
  params: Promise<{ id: string }>;
};

type Proveedor = {
  id: string;
  nombre_fantasia: string;
  logo_url: string | null;
  rut: string | null;
  email: string | null;
  telefono: string | null;
  contacto: string | null;
  notas: string | null;
};

type ProductoVinculadoDetalle = {
  woo_product_id: number;
  nombre: string;
  image_url: string | null;
};

export default async function ProveedorDetallePage({ params }: Props) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("proveedores")
    .select("id, nombre_fantasia, logo_url, rut, email, telefono, contacto, notas")
    .eq("id", id)
    .maybeSingle();

  if (error && !error.message.includes("Could not find the table")) {
    throw new Error(error.message);
  }
  if (!data) {
    notFound();
  }

  const proveedor = data as Proveedor;

  let productosVinculados = 0;
  let costoTotalStock = 0;
  let productosVinculadosDetalle: ProductoVinculadoDetalle[] = [];

  let filasProductos: Array<{ woo_product_id: number; precio_costo: number | null }> = [];
  const { data: productosData, error: productosError } = await supabase
    .from("productos_mayoristas")
    .select("woo_product_id, precio_costo")
    .eq("proveedor_id", proveedor.id);

  const tablaProductosMayoristasNoExiste =
    productosError?.message.includes("Could not find the table") ||
    productosError?.message.includes("does not exist");
  const columnaProveedorNoExiste = productosError?.message.includes("proveedor_id");

  if (productosError && !tablaProductosMayoristasNoExiste && !columnaProveedorNoExiste) {
    throw new Error(productosError.message);
  }

  if (!productosError && Array.isArray(productosData)) {
    filasProductos = productosData as Array<{ woo_product_id: number; precio_costo: number | null }>;
  }

  if (tablaProductosMayoristasNoExiste || columnaProveedorNoExiste) {
    const { data: wholesaleData, error: wholesaleError } = await supabase
      .from("wholesale_products")
      .select("woo_product_id, precio_costo")
      .eq("proveedor_id", proveedor.id);

    if (
      wholesaleError &&
      !wholesaleError.message.includes("Could not find the table") &&
      !wholesaleError.message.includes("does not exist") &&
      !wholesaleError.message.includes("proveedor_id")
    ) {
      throw new Error(wholesaleError.message);
    }

    if (!wholesaleError && Array.isArray(wholesaleData)) {
      filasProductos = wholesaleData as Array<{ woo_product_id: number; precio_costo: number | null }>;
    }
  }

  productosVinculados = filasProductos.length;

  if (filasProductos.length > 0) {
    const ids = filasProductos.map((fila) => fila.woo_product_id);
    const costoPorId = new Map<number, number>();
    for (const fila of filasProductos) {
      costoPorId.set(fila.woo_product_id, Number(fila.precio_costo ?? 0));
    }

    const { data: cacheData, error: cacheError } = await supabase
      .from("woo_product_cache")
      .select("woo_product_id, name, image_url, manage_stock, stock_quantity")
      .in("woo_product_id", ids);

    if (cacheError && !cacheError.message.includes("Could not find the table")) {
      throw new Error(cacheError.message);
    }

    if (Array.isArray(cacheData)) {
      const cachePorId = new Map<
        number,
        {
          name?: string | null;
          image_url?: string | null;
          manage_stock?: boolean | null;
          stock_quantity?: number | null;
        }
      >();
      for (const fila of cacheData as Array<{
        woo_product_id: number;
        name?: string | null;
        image_url?: string | null;
        manage_stock?: boolean | null;
        stock_quantity?: number | null;
      }>) {
        cachePorId.set(fila.woo_product_id, fila);
        const costo = Number(costoPorId.get(fila.woo_product_id) ?? 0);
        const cantidad = Boolean(fila.manage_stock) ? Math.max(0, Number(fila.stock_quantity ?? 0)) : 0;
        costoTotalStock += costo * cantidad;
      }

      productosVinculadosDetalle = ids.map((wooProductId) => {
        const cache = cachePorId.get(wooProductId);
        return {
          woo_product_id: wooProductId,
          nombre: String(cache?.name ?? `Producto #${wooProductId}`),
          image_url: cache?.image_url ?? null,
        };
      });
    }
  }

  return (
    <section className="space-y-4">
      <AdminDashboardHeader pestanaActiva="proveedores" />

      <ProveedorDetallePanel
        proveedor={proveedor}
        metricas={{
          productosVinculados,
          costoTotalStock,
        }}
        productosVinculados={productosVinculadosDetalle}
      />
    </section>
  );
}
