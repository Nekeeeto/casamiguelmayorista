import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { crearContacto, listarContactos } from "@/lib/whatsapp-contactos";

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const tagsParam = url.searchParams.get("tags");
  const tags = tagsParam ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
  const ordenRaw = url.searchParams.get("orden");
  const orden = ordenRaw === "nombre" || ordenRaw === "fecha_creacion" || ordenRaw === "ultimo_mensaje" ? ordenRaw : "fecha_creacion";
  const direccionRaw = url.searchParams.get("direccion");
  const direccion = direccionRaw === "asc" ? "asc" : "desc";
  const optOutRaw = url.searchParams.get("optOut");
  const optOut = optOutRaw === "activos" || optOutRaw === "baja" ? optOutRaw : "todos";

  try {
    const contactos = await listarContactos({
      q: url.searchParams.get("q") ?? undefined,
      tags,
      orden,
      direccion,
      optOut,
    });
    return NextResponse.json({ contactos, total: contactos.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error listando contactos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: { nombre?: string; telefono?: string; tags?: string[]; notas?: string; avatar_url?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!body.telefono) {
    return NextResponse.json({ error: "Falta teléfono." }, { status: 400 });
  }

  try {
    const contacto = await crearContacto({
      nombre: body.nombre ?? "",
      telefono: body.telefono,
      tags: body.tags,
      notas: body.notas,
      avatar_url: body.avatar_url,
    });
    return NextResponse.json({ contacto }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error creando contacto.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
