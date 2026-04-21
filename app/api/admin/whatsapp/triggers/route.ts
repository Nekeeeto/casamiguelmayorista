import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { TRIGGER_KEYS_TODOS, type TriggerKey } from "@/lib/whatsapp-woo-triggers";

const KEYS = TRIGGER_KEYS_TODOS;

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_triggers")
    .select(
      "trigger_key, enabled, template_name, template_language, variable_mapping, template_header_media_url, woo_status_slugs, updated_at",
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ triggers: data ?? [] });
}

export async function PUT(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: {
    trigger_key?: string;
    enabled?: boolean;
    template_name?: string | null;
    template_language?: string;
    variable_mapping?: Record<string, string>;
    template_header_media_url?: string | null;
    woo_status_slugs?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const triggerKey = body.trigger_key as TriggerKey | undefined;
  if (!triggerKey || !KEYS.includes(triggerKey)) {
    return NextResponse.json({ error: "Trigger inválido." }, { status: 400 });
  }

  if (body.woo_status_slugs !== undefined && triggerKey === "cart_abandoned") {
    return NextResponse.json({ error: "cart_abandoned no usa estados Woo." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.template_name !== undefined) patch.template_name = body.template_name || null;
  if (body.template_language !== undefined) patch.template_language = body.template_language || "es";
  if (body.variable_mapping !== undefined) patch.variable_mapping = body.variable_mapping ?? {};
  if (body.template_header_media_url !== undefined) {
    patch.template_header_media_url = body.template_header_media_url?.trim() || null;
  }
  if (body.woo_status_slugs !== undefined) {
    if (!Array.isArray(body.woo_status_slugs)) {
      return NextResponse.json({ error: "woo_status_slugs debe ser un array de strings." }, { status: 400 });
    }
    const slugs: string[] = [];
    for (const item of body.woo_status_slugs) {
      if (typeof item !== "string") {
        return NextResponse.json({ error: "Cada slug debe ser texto." }, { status: 400 });
      }
      const s = item.trim().toLowerCase().replace(/^wc-/, "");
      if (!s) continue;
      if (!/^[a-z0-9_-]+$/.test(s)) {
        return NextResponse.json({ error: `Slug inválido: ${item}` }, { status: 400 });
      }
      if (!slugs.includes(s)) slugs.push(s);
    }
    if (slugs.length > 80) {
      return NextResponse.json({ error: "Máximo 80 estados por trigger." }, { status: 400 });
    }
    patch.woo_status_slugs = slugs;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("whatsapp_triggers")
    .update(patch)
    .eq("trigger_key", triggerKey);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
