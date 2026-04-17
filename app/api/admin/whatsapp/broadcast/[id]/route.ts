import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ejecutarChunk } from "@/lib/whatsapp-broadcast-runner";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { id } = await context.params;
  const supabase = getSupabaseAdmin();
  const url = new URL(req.url);
  const pagina = Math.max(0, Number(url.searchParams.get("pagina") ?? 0));
  const tamano = Math.max(1, Math.min(200, Number(url.searchParams.get("tamano") ?? 50)));

  const { data: broadcast, error: errBroadcast } = await supabase
    .from("whatsapp_broadcasts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (errBroadcast) return NextResponse.json({ error: errBroadcast.message }, { status: 500 });
  if (!broadcast) return NextResponse.json({ error: "Broadcast no encontrado." }, { status: 404 });

  const offset = pagina * tamano;
  const { data: resultados, error: errRes, count } = await supabase
    .from("whatsapp_broadcast_results")
    .select("id, to_phone, ok, skipped, error, sent_at, wa_message_id", { count: "exact" })
    .eq("broadcast_id", id)
    .order("sent_at", { ascending: false, nullsFirst: true })
    .range(offset, offset + tamano - 1);
  if (errRes) return NextResponse.json({ error: errRes.message }, { status: 500 });

  return NextResponse.json({
    broadcast,
    resultados: resultados ?? [],
    paginacion: { pagina, tamano, total: count ?? 0 },
  });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { id } = await context.params;
  let body: { action?: string };
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  if (body.action === "cancel") {
    const { error } = await supabase
      .from("whatsapp_broadcasts")
      .update({ status: "cancelado" })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "run-next-chunk") {
    try {
      const resultado = await ejecutarChunk(id);
      return NextResponse.json(resultado);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error ejecutando chunk.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
}
