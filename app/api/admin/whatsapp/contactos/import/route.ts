import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { importarContactosCsv } from "@/lib/whatsapp-contactos";

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const contentType = req.headers.get("content-type") ?? "";
  let csv = "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as { csv?: string };
      csv = typeof body.csv === "string" ? body.csv : "";
    } else {
      csv = await req.text();
    }
  } catch {
    return NextResponse.json({ error: "No se pudo leer el body." }, { status: 400 });
  }

  if (!csv.trim()) {
    return NextResponse.json({ error: "CSV vacío." }, { status: 400 });
  }

  try {
    const resumen = await importarContactosCsv(csv);
    return NextResponse.json(resumen);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error importando CSV.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
