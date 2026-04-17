import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { TriggerKey } from "@/lib/whatsapp-woo-triggers";

const KEYS: TriggerKey[] = ["order_confirmed", "order_shipped", "order_delivered"];

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_triggers")
    .select("trigger_key, enabled, template_name, template_language, variable_mapping, updated_at");
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

  const patch: Record<string, unknown> = {};
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.template_name !== undefined) patch.template_name = body.template_name || null;
  if (body.template_language !== undefined) patch.template_language = body.template_language || "es";
  if (body.variable_mapping !== undefined) patch.variable_mapping = body.variable_mapping ?? {};

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("whatsapp_triggers")
    .update(patch)
    .eq("trigger_key", triggerKey);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
