import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false as const, error: auth.message },
      { status: auth.status },
    );
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("importaciones_inventario_csv")
    .select("id, created_at, nombre_archivo, mapeo, resultado")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    if (error.message.includes("Could not find the table")) {
      return NextResponse.json({ ok: true as const, filas: [] });
    }
    return NextResponse.json(
      { ok: false as const, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true as const, filas: data ?? [] });
}
