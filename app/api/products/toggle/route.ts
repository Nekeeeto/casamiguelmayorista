import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

type TogglePayload = {
  woo_product_id: number;
  sku?: string;
  name: string;
  is_active: boolean;
};

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const payload = (await req.json()) as TogglePayload;

    if (
      !payload.woo_product_id ||
      !payload.name ||
      typeof payload.is_active !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Payload inválido para actualizar producto." },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin.from("wholesale_products").upsert(
      {
        woo_product_id: payload.woo_product_id,
        sku: payload.sku ?? null,
        name: payload.name,
        is_active: payload.is_active,
      },
      {
        onConflict: "woo_product_id",
      },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
