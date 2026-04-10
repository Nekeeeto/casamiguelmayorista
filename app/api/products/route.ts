import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type {
  AdminProduct,
  WholesaleProductRecord,
  WooProductCacheRecord,
} from "@/lib/types";

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export async function GET(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 100);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const cacheQuery = supabaseAdmin
      .from("woo_product_cache")
      .select(
        "woo_product_id, sku, name, base_price, image_url, status, woo_updated_at, synced_at",
        { count: "exact" },
      )
      .order("woo_updated_at", { ascending: false, nullsFirst: false })
      .range(from, to);

    const { data: cachedProducts, error: cacheError, count } = await cacheQuery;

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
        woo_updated_at: product.woo_updated_at,
        synced_at: product.synced_at,
        is_active: wholesaleData?.is_active ?? false,
        min_quantity: wholesaleData?.min_quantity ?? 1,
        custom_price: wholesaleData?.custom_price ?? null,
      };
    });

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json(
      {
        products,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
