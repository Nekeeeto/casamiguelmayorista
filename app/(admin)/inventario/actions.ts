"use server";

import { revalidatePath } from "next/cache";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

type EscalaVolumen = {
  cantidad_minima: number;
  precio: number;
};

function parsearEscalasVolumen(raw: string): EscalaVolumen[] {
  let payload: unknown = [];

  try {
    payload = raw.trim() ? JSON.parse(raw) : [];
  } catch {
    throw new Error("El JSON de escalas de volumen no es valido.");
  }

  if (!Array.isArray(payload)) {
    throw new Error("Las escalas de volumen deben ser un arreglo.");
  }

  return payload.map((item, index) => {
    const fila = item as Partial<EscalaVolumen>;
    if (
      typeof fila.cantidad_minima !== "number" ||
      !Number.isFinite(fila.cantidad_minima) ||
      fila.cantidad_minima <= 0
    ) {
      throw new Error(`Escala ${index + 1}: cantidad_minima invalida.`);
    }
    if (typeof fila.precio !== "number" || !Number.isFinite(fila.precio) || fila.precio < 0) {
      throw new Error(`Escala ${index + 1}: precio invalido.`);
    }
    return {
      cantidad_minima: fila.cantidad_minima,
      precio: fila.precio,
    };
  });
}

export async function actualizarInventarioAction(formData: FormData) {
  const wooProductId = Number(formData.get("woo_product_id"));
  const nombre = String(formData.get("nombre") ?? "");
  const sku = String(formData.get("sku") ?? "");
  const precioVenta = Number(formData.get("precio_venta"));
  const precioCosto = Number(formData.get("precio_costo"));
  const escalasRaw = String(formData.get("escalas_volumen") ?? "[]");

  if (!Number.isFinite(wooProductId) || wooProductId <= 0) {
    throw new Error("Producto invalido.");
  }
  if (!nombre.trim()) {
    throw new Error("Nombre del producto requerido.");
  }
  if (!Number.isFinite(precioCosto) || precioCosto < 0) {
    throw new Error("Precio costo invalido.");
  }

  const escalasVolumen = parsearEscalasVolumen(escalasRaw);
  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin.from("productos_mayoristas").upsert(
    {
      woo_product_id: wooProductId,
      nombre: nombre.trim(),
      sku: sku.trim() || null,
      precio_venta: Number.isFinite(precioVenta) ? precioVenta : null,
      precio_costo: precioCosto,
      escalas_volumen: escalasVolumen,
    },
    { onConflict: "woo_product_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/inventario");
  revalidatePath("/admin/inventario");
}
