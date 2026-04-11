import type { SupabaseClient } from "@supabase/supabase-js";

/** IDs de productos Woo marcados como activos en el canal mayorista (publicados B2B). */
export async function obtenerIdsWooMayoristaActivo(
  supabaseAdmin: SupabaseClient,
): Promise<number[]> {
  const { data, error } = await supabaseAdmin
    .from("productos_mayoristas")
    .select("woo_product_id")
    .eq("activo", true);

  if (error) {
    const tablaNoExiste = error.message.includes(
      "Could not find the table 'public.productos_mayoristas'",
    );
    if (!tablaNoExiste) {
      throw new Error(error.message);
    }

    const { data: legacy, error: legacyError } = await supabaseAdmin
      .from("wholesale_products")
      .select("woo_product_id")
      .eq("is_active", true);

    if (legacyError) {
      throw new Error(legacyError.message);
    }

    return ((legacy ?? []) as { woo_product_id: number }[])
      .map((row) => row.woo_product_id)
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  return ((data ?? []) as { woo_product_id: number }[])
    .map((row) => row.woo_product_id)
    .filter((id) => Number.isFinite(id) && id > 0);
}
