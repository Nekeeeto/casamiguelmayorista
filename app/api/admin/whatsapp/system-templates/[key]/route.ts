import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { actualizarSystemTemplate, type SystemTemplateKey } from "@/lib/whatsapp-system-templates";

const KEYS_VALIDOS: SystemTemplateKey[] = ["opt_out_confirmacion", "opt_in_confirmacion"];

function esKeyValido(key: string): key is SystemTemplateKey {
  return (KEYS_VALIDOS as string[]).includes(key);
}

export async function PUT(req: Request, context: { params: Promise<{ key: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { key } = await context.params;
  if (!esKeyValido(key)) {
    return NextResponse.json({ error: "Template desconocido." }, { status: 404 });
  }

  let body: { texto?: unknown };
  try {
    body = (await req.json()) as { texto?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const texto = typeof body.texto === "string" ? body.texto : "";
  if (!texto.trim()) {
    return NextResponse.json({ error: "El texto no puede estar vacío." }, { status: 400 });
  }

  try {
    await actualizarSystemTemplate(key, texto);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error actualizando template.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
