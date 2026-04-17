import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { listarSystemTemplates } from "@/lib/whatsapp-system-templates";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  try {
    const filas = await listarSystemTemplates();
    return NextResponse.json({ templates: filas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error listando templates del sistema.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
