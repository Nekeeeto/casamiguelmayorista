import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { AdminProduct, WholesaleProductRecord } from "@/lib/types";
import { fetchAllWooProducts } from "@/lib/woo";

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
    const wooProducts = await fetchAllWooProducts(
      maxProducts != null ? { maxProducts } : undefined,
    );
    const productIds = wooProducts.map((product) => product.id);

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

    const products: AdminProduct[] = wooProducts.map((product) => {
      const wholesaleData = wholesaleMap.get(product.id);
      const rawPrice =
        product.price || product.sale_price || product.regular_price || "0";

      return {
        id: product.id,
        name: product.name,
        sku: product.sku ?? "",
        base_price: Number(rawPrice),
        image: product.images?.[0]?.src ?? null,
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
