import type { SupabaseClient } from "@supabase/supabase-js";

import type { WooProduct } from "@/lib/woo";

type CacheUpsertRow = {
  woo_product_id: number;
  sku: string | null;
  name: string;
  base_price: number;
  image_url: string | null;
  status: string;
  woo_updated_at: string | null;
  synced_at: string;
};

function getBasePrice(product: WooProduct) {
  const rawPrice =
    product.price || product.sale_price || product.regular_price || "0";
  const normalized = String(rawPrice).replace(",", ".");
  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  // Matches numeric(12,2) upper bound safety margin.
  const maxAllowed = 9999999999.99;
  if (parsed > maxAllowed) {
    return 0;
  }

  return Number(parsed.toFixed(2));
}

export function mapWooProductToCacheRow(product: WooProduct): CacheUpsertRow {
  return {
    woo_product_id: product.id,
    sku: product.sku ?? null,
    name: product.name,
    base_price: getBasePrice(product),
    image_url: product.images?.[0]?.src ?? null,
    status: product.status ?? "publish",
    woo_updated_at: product.date_modified_gmt ?? null,
    synced_at: new Date().toISOString(),
  };
}

export async function upsertWooProductsCache(
  supabaseAdmin: SupabaseClient,
  products: WooProduct[],
) {
  if (products.length === 0) {
    return;
  }

  const rows = products.map(mapWooProductToCacheRow);
  const { error } = await supabaseAdmin.from("woo_product_cache").upsert(rows, {
    onConflict: "woo_product_id",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteWooProductsCache(
  supabaseAdmin: SupabaseClient,
  productIds: number[],
) {
  if (productIds.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("woo_product_cache")
    .delete()
    .in("woo_product_id", productIds);

  if (error) {
    throw new Error(error.message);
  }
}
