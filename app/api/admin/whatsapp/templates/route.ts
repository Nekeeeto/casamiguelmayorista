import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { listApprovedTemplates, WhatsappCloudApiError } from "@/lib/whatsapp-cloud-api";
import { extraerPlaceholders } from "@/lib/whatsapp-templates";

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const soloAprobados = url.searchParams.get("soloAprobados") !== "false";

  try {
    const todas = await listApprovedTemplates();
    const filtradas = soloAprobados ? todas.filter((t) => t.status === "APPROVED") : todas;
    const normalizadas = filtradas.map((t) => ({
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
