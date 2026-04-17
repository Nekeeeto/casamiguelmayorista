import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { listarTagsDistinct } from "@/lib/whatsapp-contactos";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  try {
    const tags = await listarTagsDistinct();
    return NextResponse.json({ tags });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error listando tags.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
