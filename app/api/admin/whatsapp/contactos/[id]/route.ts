import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { actualizarContacto, eliminarContacto } from "@/lib/whatsapp-contactos";

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { id } = await context.params;
  let body: {
    nombre?: string;
    telefono?: string;
    tags?: string[];
    notas?: string;
    opted_out?: boolean;
    avatar_url?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  try {
    const contacto = await actualizarContacto(id, body);
    return NextResponse.json({ contacto });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error actualizando contacto.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await context.params;
  try {
    await eliminarContacto(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error eliminando contacto.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
