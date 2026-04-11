import type { SupabaseClient } from "@supabase/supabase-js";

import { upsertFilaMayorista } from "@/lib/inventario-mayorista-upsert";

type FilaCache = {
  name?: string | null;
  sku?: string | null;
  base_price?: number | null;
};

type FilaMayoristaActual = {
  nombre?: string | null;
  sku?: string | null;
  precio_venta?: number | null;
  precio_costo?: number | null;
  ventas_mayorista?: number | null;
  activo?: boolean | null;
};

export async function upsertProveedorProducto(
  supabaseAdmin: SupabaseClient,
  wooProductId: number,
  proveedorId: string | null,
) {
  if (!Number.isFinite(wooProductId) || wooProductId <= 0) {
    throw new Error("Producto inválido.");
  }

  const { data: cacheData, error: cacheError } = await supabaseAdmin
    .from("woo_product_cache")
    .select("name, sku, base_price")
    .eq("woo_product_id", wooProductId)
    .maybeSingle();

  if (cacheError) {
    throw new Error(cacheError.message);
  }

  const { data: mayoristaData, error: mayoristaError } = await supabaseAdmin
    .from("productos_mayoristas")
    .select("nombre, sku, precio_venta, precio_costo, ventas_mayorista, activo")
    .eq("woo_product_id", wooProductId)
    .maybeSingle();

  if (
    mayoristaError &&
    !mayoristaError.message.includes("Could not find the table 'public.productos_mayoristas'")
  ) {
    throw new Error(mayoristaError.message);
  }

  const cache = (cacheData as FilaCache | null) ?? null;
  const mayorista = (mayoristaData as FilaMayoristaActual | null) ?? null;

  const nombre = (mayorista?.nombre ?? cache?.name ?? "").trim() || `Producto #${wooProductId}`;
  const sku = mayorista?.sku ?? cache?.sku ?? null;
  const precioBaseWoo = Number(cache?.base_price ?? mayorista?.precio_venta ?? 0);
  const precioMayorista = Number(mayorista?.precio_venta ?? cache?.base_price ?? 0);
  const precioCosto = Number(mayorista?.precio_costo ?? 0);
  const ventasMayorista = Number(mayorista?.ventas_mayorista ?? 0);
  const activo = Boolean(mayorista?.activo ?? false);

  await upsertFilaMayorista(supabaseAdmin, {
    woo_product_id: wooProductId,
    nombre,
    sku,
    precio_base_woo: Number.isFinite(precioBaseWoo) ? precioBaseWoo : 0,
    precio_mayorista: Number.isFinite(precioMayorista) ? precioMayorista : 0,
    precio_costo: Number.isFinite(precioCosto) ? precioCosto : 0,
    ventas_mayorista: Number.isFinite(ventasMayorista) ? ventasMayorista : 0,
    activo,
    proveedor_id: proveedorId,
  });
}
