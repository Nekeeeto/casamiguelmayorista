import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type {
  AdminProduct,
  WholesaleProductRecord,
  WooProductCacheRecord,
} from "@/lib/types";

function getWooCatalogLimit(): number | undefined {
  const raw = process.env.WHOLESALE_CATALOG_LIMIT?.trim().toLowerCase();
  if (raw === "all" || raw === "0" || raw === "") {
    return undefined;
  }
  if (!raw) {
    return 5;
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const maxProducts = getWooCatalogLimit();
    let cacheQuery = supabaseAdmin
      .from("woo_product_cache")
      .select(
        "woo_product_id, sku, name, base_price, image_url, status, woo_updated_at, synced_at",
      )
      .order("woo_updated_at", { ascending: false, nullsFirst: false });

    if (maxProducts != null) {
      cacheQuery = cacheQuery.limit(maxProducts);
    }

    const { data: cachedProducts, error: cacheError } = await cacheQuery;

    if (cacheError) {
      return NextResponse.json({ error: cacheError.message }, { status: 500 });
    }

    const cacheRows = (cachedProducts ?? []) as WooProductCacheRecord[];
    const productIds = cacheRows.map((product) => product.woo_product_id);

    let wholesaleRows: WholesaleProductRecord[] = [];

    if (productIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("wholesale_products")
        .select(
          "woo_product_id, sku, name, is_active, min_quantity, custom_price",
        )
        .in("woo_product_id", productIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      wholesaleRows = (data ?? []) as WholesaleProductRecord[];
    }

    const wholesaleMap = new Map(
      wholesaleRows.map((row) => [row.woo_product_id, row]),
    );

    const products: AdminProduct[] = cacheRows.map((product) => {
      const wholesaleData = wholesaleMap.get(product.woo_product_id);

      return {
        id: product.woo_product_id,
        name: product.name,
        sku: product.sku ?? "",
        base_price: Number(product.base_price || 0),
        image: product.image_url ?? null,
        is_active: wholesaleData?.is_active ?? false,
        min_quantity: wholesaleData?.min_quantity ?? 1,
        custom_price: wholesaleData?.custom_price ?? null,
      };
    });

    return NextResponse.json({ products }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
