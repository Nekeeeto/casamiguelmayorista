import { NextResponse } from "next/server";

import {
  upsertWooCategoriesCache,
  upsertWooProductsCache,
} from "@/lib/catalog-sync";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllWooProductCategories, fetchAllWooProducts } from "@/lib/woo";

function isAuthorized(req: Request) {
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (isVercelCron) {
    return true;
  }

  // Allows triggering from admin UI without exposing sync token in frontend.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  const referer = req.headers.get("referer");
  const isSameOrigin = origin && host ? origin.includes(host) : false;
  const isAdminReferer = referer?.includes("/admin") ?? false;
  if (isSameOrigin && isAdminReferer) {
    return true;
  }

  const expectedToken = process.env.WHOLESALE_SYNC_TOKEN;
  if (!expectedToken) {
    return false;
  }

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${expectedToken}`;
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const [productos, categorias] = await Promise.all([
      fetchAllWooProducts(),
      fetchAllWooProductCategories(),
    ]);

    await Promise.all([
      upsertWooCategoriesCache(supabaseAdmin, categorias),
      upsertWooProductsCache(supabaseAdmin, productos),
    ]);

    return NextResponse.json({
      ok: true,
      synced_products: productos.length,
      synced_categories: categorias.length,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
