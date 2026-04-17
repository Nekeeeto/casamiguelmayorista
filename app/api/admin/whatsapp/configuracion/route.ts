import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import {
  guardarConfigWhatsapp,
  leerConfigWhatsapp,
  probarConexionWhatsapp,
  type WhatsappConfigPartial,
} from "@/lib/whatsapp-config";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  try {
    const config = await leerConfigWhatsapp();
    return NextResponse.json({
      fuente: config.fuente,
      updatedAt: config.updatedAt,
      pricing: config.pricing,
      valores: {
        phone_number_id: config.valores.phone_number_id,
        waba_id: config.valores.waba_id,
        webhook_verify_token: config.valores.webhook_verify_token,
        access_token_presente: Boolean(config.valores.access_token),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error leyendo configuración.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  if (url.searchParams.get("action") === "test") {
    try {
      const resultado = await probarConexionWhatsapp();
      const status = resultado.ok ? 200 : 400;
      return NextResponse.json(resultado, { status });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error probando conexión.";
      return NextResponse.json({ ok: false, error: message, code: null }, { status: 500 });
    }
  }

  let body: WhatsappConfigPartial;
  try {
    body = (await req.json()) as WhatsappConfigPartial;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  try {
    await guardarConfigWhatsapp(body);
    const config = await leerConfigWhatsapp();
    return NextResponse.json({ ok: true, fuente: config.fuente, updatedAt: config.updatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error guardando configuración.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
