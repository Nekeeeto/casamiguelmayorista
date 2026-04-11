import type { SupabaseClient } from "@supabase/supabase-js";

export type FilaMayoristaUpsert = {
  woo_product_id: number;
  nombre: string;
  sku: string | null;
  precio_base_woo: number;
  precio_mayorista: number;
  precio_costo: number;
  ventas_mayorista: number;
  activo: boolean;
  proveedor_id?: string | null;
};

const MSG_FALTA_PRECIO_COSTO =
  "Falta la columna precio_costo en wholesale_products. En Supabase → SQL Editor ejecutá el bloque DO «Legacy wholesale_products» del archivo supabase/schema_phase4_inventario_metricas.sql (o solo los ALTER a wholesale_products).";

/**
 * Insert/actualiza una fila en productos_mayoristas o, si no existe la tabla, en wholesale_products.
 */
export async function upsertFilaMayorista(
  supabaseAdmin: SupabaseClient,
  fila: FilaMayoristaUpsert,
): Promise<void> {
  const {
    woo_product_id: wooProductId,
    nombre,
    sku,
    precio_mayorista: precioMayoristaIn,
    precio_costo: precioCostoIn,
    ventas_mayorista: ventasMayoristaIn,
    activo,
    proveedor_id,
  } = fila;

  if (!Number.isFinite(wooProductId) || wooProductId <= 0 || !nombre.trim()) {
    throw new Error("Producto inválido.");
  }

  const precioMayorista = Number(precioMayoristaIn.toFixed(2));
  const precioCosto = Number(precioCostoIn.toFixed(2));
  const ventasMayorista = Math.max(0, Math.floor(ventasMayoristaIn));

  if (!Number.isFinite(precioMayorista) || precioMayorista < 0) {
    throw new Error("Precio mayorista inválido.");
  }
  if (!Number.isFinite(precioCosto) || precioCosto < 0) {
    throw new Error("Precio costo inválido.");
  }

  const payloadNuevo = {
    woo_product_id: wooProductId,
    nombre: nombre.trim(),
    sku: sku?.trim() || null,
    activo,
    precio_venta: precioMayorista,
    precio_costo: precioCosto,
    ventas_mayorista: ventasMayorista,
    proveedor_id: proveedor_id ?? null,
  };

  const { error } = await supabaseAdmin
    .from("productos_mayoristas")
    .upsert(payloadNuevo, { onConflict: "woo_product_id" });

  if (!error) {
    return;
  }

  const tablaNoExiste = error.message.includes(
    "Could not find the table 'public.productos_mayoristas'",
  );

  if (!tablaNoExiste) {
    throw new Error(error.message);
  }

  const payloadLegacyFull: Record<string, unknown> = {
    woo_product_id: wooProductId,
    name: nombre.trim(),
    sku: sku?.trim() || null,
    is_active: activo,
    custom_price: precioMayorista,
    min_quantity: 1,
    precio_costo: precioCosto,
    ventas_mayorista: ventasMayorista,
    proveedor_id: proveedor_id ?? null,
  };

  let { error: fallbackError } = await supabaseAdmin
    .from("wholesale_products")
    .upsert(payloadLegacyFull, { onConflict: "woo_product_id" });

  if (fallbackError?.message.includes("ventas_mayorista")) {
    const sinVentas: Record<string, unknown> = { ...payloadLegacyFull };
    delete sinVentas.ventas_mayorista;
    ({ error: fallbackError } = await supabaseAdmin
      .from("wholesale_products")
      .upsert(sinVentas, { onConflict: "woo_product_id" }));
  }

  if (fallbackError?.message.includes("proveedor_id")) {
    const sinProveedor: Record<string, unknown> = { ...payloadLegacyFull };
    delete sinProveedor.proveedor_id;
    ({ error: fallbackError } = await supabaseAdmin
      .from("wholesale_products")
      .upsert(sinProveedor, { onConflict: "woo_product_id" }));
  }

  if (fallbackError?.message.includes("precio_costo")) {
    throw new Error(MSG_FALTA_PRECIO_COSTO);
  }

  if (fallbackError) {
    throw new Error(fallbackError.message);
  }
}
