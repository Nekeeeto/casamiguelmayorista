import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function normalizarLista(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (t) out.push(t);
  }
  return out.slice(0, 40);
}

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_config")
    .select("inbox_quick_replies")
    .eq("id", 1)
    .maybeSingle<{ inbox_quick_replies: unknown }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ replies: normalizarLista(data?.inbox_quick_replies) });
}

export async function PUT(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: { replies?: unknown };
  try {
    body = (await req.json()) as { replies?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const replies = normalizarLista(body.replies);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("whatsapp_config").update({ inbox_quick_replies: replies }).eq("id", 1);
  if (error) {
    return NextResponse.json(
      {
        error: `${error.message} (¿corriste supabase/schema_phase10_inbox_quick_replies.sql?).`,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, replies });
}
