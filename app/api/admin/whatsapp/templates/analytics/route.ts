import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { leerConfigWhatsapp } from "@/lib/whatsapp-config";
import { fetchTemplateAnalyticsCampo, WhatsappCloudApiError } from "@/lib/whatsapp-cloud-api";

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const templateId = url.searchParams.get("templateId")?.trim();
  if (!templateId) {
    return NextResponse.json({ error: "Falta templateId (id numérico de la plantilla en Meta)." }, { status: 400 });
  }

  const end = Math.floor(Date.now() / 1000);
  const start = end - 7 * 24 * 60 * 60;

  try {
    const config = await leerConfigWhatsapp();
    const wabaId = config.valores.waba_id?.trim();
    const token = config.valores.access_token?.trim();
    if (!wabaId || !token) {
      return NextResponse.json({ error: "Falta WHATSAPP_BUSINESS_ACCOUNT_ID o token en configuración." }, { status: 500 });
    }
    const data = await fetchTemplateAnalyticsCampo(wabaId, token, templateId, start, end);
    return NextResponse.json({ ok: true, start, end, data });
  } catch (error) {
    if (error instanceof WhatsappCloudApiError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.status >= 400 && error.status < 600 ? error.status : 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error" },
      { status: 500 },
    );
  }
}
