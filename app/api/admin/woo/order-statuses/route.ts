import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { listarEstadosPedidoWooParaAdmin } from "@/lib/woo-order-statuses-catalog";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  try {
    const statuses = await listarEstadosPedidoWooParaAdmin();
    return NextResponse.json({ statuses });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error listando estados.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
