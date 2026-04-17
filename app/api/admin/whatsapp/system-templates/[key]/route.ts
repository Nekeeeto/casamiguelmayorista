import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import {
  actualizarSystemTemplate,
  type PatchSystemTemplate,
  type SystemTemplateKey,
  type SystemTemplateReplyMode,
} from "@/lib/whatsapp-system-templates";

const KEYS_VALIDOS: SystemTemplateKey[] = [
  "opt_out_confirmacion",
  "opt_in_confirmacion",
  "greeting_auto",
  "delay_auto",
];

function esKeyValido(key: string): key is SystemTemplateKey {
  return (KEYS_VALIDOS as string[]).includes(key);
}

function esReplyMode(v: unknown): v is SystemTemplateReplyMode {
  return v === "text" || v === "template";
}

function normalizarParametrosApi(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => (typeof x === "string" ? x : String(x ?? "")));
}

export async function PUT(req: Request, context: { params: Promise<{ key: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { key } = await context.params;
  if (!esKeyValido(key)) {
    return NextResponse.json({ error: "Template desconocido." }, { status: 404 });
  }

  let body: {
    texto?: unknown;
    reply_mode?: unknown;
    template_name?: unknown;
    template_language?: unknown;
    template_parameters?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const texto = typeof body.texto === "string" ? body.texto : "";
  const reply_mode: SystemTemplateReplyMode = esReplyMode(body.reply_mode) ? body.reply_mode : "text";
  const template_name = typeof body.template_name === "string" ? body.template_name : null;
  const template_language = typeof body.template_language === "string" ? body.template_language : null;
  const template_parameters = normalizarParametrosApi(body.template_parameters);

  const patch: PatchSystemTemplate = {
    texto,
    reply_mode,
    template_name: template_name?.trim() ? template_name.trim() : null,
    template_language: template_language?.trim() ? template_language.trim() : null,
    template_parameters,
  };

  try {
    await actualizarSystemTemplate(key, patch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error actualizando template.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
