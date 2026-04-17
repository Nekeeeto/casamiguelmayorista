import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { leerConfigWhatsapp } from "@/lib/whatsapp-config";
import { sendTextMessage, WhatsappCloudApiError } from "@/lib/whatsapp-cloud-api";
import { esTelefonoUyValido, normalizarTelefonoWaUruguay } from "@/lib/telefono-wa-uruguay";

const VENTANA_24H_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const phone = url.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "Falta phone." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id, direction, from_phone, to_phone, body, media_type, media_url, status, error, sent_at, received_at, wa_message_id")
    .or(`from_phone.eq.${phone},to_phone.eq.${phone}`)
    .order("received_at", { ascending: true })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ultimoEntrante = (data ?? [])
    .filter((m: { direction: string }) => m.direction === "in")
    .sort(
      (a: { received_at: string }, b: { received_at: string }) =>
        new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
    )[0] as { received_at: string } | undefined;

  const ventanaCierraEn = ultimoEntrante
    ? new Date(new Date(ultimoEntrante.received_at).getTime() + VENTANA_24H_MS).toISOString()
    : null;
  const ventanaAbierta = ultimoEntrante
    ? new Date().getTime() - new Date(ultimoEntrante.received_at).getTime() < VENTANA_24H_MS
    : false;

  return NextResponse.json({
    mensajes: data ?? [],
    ventanaAbierta,
    ventanaCierraEn,
  });
}

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: { phone?: string; text?: string };
  try {
    body = (await req.json()) as { phone?: string; text?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const phone = normalizarTelefonoWaUruguay(body.phone ?? "");
  const text = (body.text ?? "").trim();
  if (!phone || !esTelefonoUyValido(phone)) {
    return NextResponse.json({ error: "Teléfono inválido." }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "Texto vacío." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: ultimoEntrante } = await supabase
    .from("whatsapp_messages")
    .select("received_at")
    .eq("from_phone", phone)
    .eq("direction", "in")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ received_at: string }>();

  if (!ultimoEntrante || new Date().getTime() - new Date(ultimoEntrante.received_at).getTime() >= VENTANA_24H_MS) {
    return NextResponse.json(
      {
        error:
          "Ventana de 24hs cerrada. Meta solo permite texto libre si hubo un mensaje entrante en las últimas 24hs. Enviá un template aprobado desde Broadcast.",
      },
      { status: 409 },
    );
  }

  try {
    const config = await leerConfigWhatsapp();
    const resultado = await sendTextMessage(phone, text, config);
    const waId = resultado.messages?.[0]?.id ?? null;
    await supabase.from("whatsapp_messages").upsert(
      {
        wa_message_id: waId ?? `local-${Date.now()}`,
        direction: "out",
        from_phone: config.valores.phone_number_id,
        to_phone: phone,
        body: text,
        status: "sent",
        sent_at: new Date().toISOString(),
      },
      { onConflict: "wa_message_id" },
    );
    return NextResponse.json({ ok: true, waMessageId: waId });
  } catch (error) {
    if (error instanceof WhatsappCloudApiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Error enviando.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
