import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import {
  createMessageTemplate,
  listApprovedTemplates,
  WhatsappCloudApiError,
} from "@/lib/whatsapp-cloud-api";
import {
  construirComponentesPlantillaMeta,
  validarMuestrasCompletas,
  validarNombrePlantillaMeta,
  type CategoriaPlantillaMeta,
  type EncabezadoPlantillaForm,
  type FormCrearPlantillaMeta,
} from "@/lib/whatsapp-meta-template-payload";
import { extraerPlaceholders } from "@/lib/whatsapp-templates";

function muestrasDesdeJson(raw: unknown): Record<number, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1) continue;
    if (typeof v === "string") out[n] = v;
  }
  return out;
}

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const soloAprobados = url.searchParams.get("soloAprobados") !== "false";

  try {
    const todas = await listApprovedTemplates();
    const filtradas = soloAprobados ? todas.filter((t) => t.status === "APPROVED") : todas;
    const normalizadas = filtradas.map((t) => ({
      id: t.id ?? null,
      name: t.name,
      language: t.language,
      category: t.category,
      status: t.status,
      placeholders: extraerPlaceholders(t.components ?? []),
      components: t.components,
    }));
    return NextResponse.json({ templates: normalizadas, total: normalizadas.length });
  } catch (error) {
    if (error instanceof WhatsappCloudApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code, status: error.status },
        { status: error.status >= 400 && error.status < 600 ? error.status : 500 },
      );
    }
    const message = error instanceof Error ? error.message : "Error listando templates.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CuerpoCrearPlantilla = {
  nombre?: string;
  idioma?: string;
  categoria?: CategoriaPlantillaMeta;
  encabezado?: EncabezadoPlantillaForm;
  cuerpo?: string;
  pie?: string;
  boton?: FormCrearPlantillaMeta["boton"];
  muestras?: Record<string, string>;
};

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: CuerpoCrearPlantilla;
  try {
    body = (await req.json()) as CuerpoCrearPlantilla;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const nombreErr = validarNombrePlantillaMeta(typeof body.nombre === "string" ? body.nombre : "");
  if (nombreErr) {
    return NextResponse.json({ error: nombreErr }, { status: 400 });
  }

  const form: FormCrearPlantillaMeta = {
    nombre: (body.nombre ?? "").trim(),
    idioma: typeof body.idioma === "string" && body.idioma.trim() ? body.idioma.trim() : "es",
    categoria: body.categoria ?? "MARKETING",
    encabezado: body.encabezado ?? { tipo: "none" },
    cuerpo: typeof body.cuerpo === "string" ? body.cuerpo : "",
    pie: typeof body.pie === "string" ? body.pie : "",
    boton: body.boton ?? null,
    muestras: muestrasDesdeJson(body.muestras),
  };

  const errMuestras = validarMuestrasCompletas(form);
  if (errMuestras) {
    return NextResponse.json({ error: errMuestras }, { status: 400 });
  }

  try {
    const components = construirComponentesPlantillaMeta(form);
    const resultado = await createMessageTemplate({
      name: form.nombre,
      language: form.idioma,
      category: form.categoria,
      components,
    });
    return NextResponse.json({ ok: true, resultado });
  } catch (error) {
    if (error instanceof WhatsappCloudApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code, status: error.status },
        { status: error.status >= 400 && error.status < 600 ? error.status : 500 },
      );
    }
    const message = error instanceof Error ? error.message : "Error creando plantilla.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
