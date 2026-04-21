import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getPhoneNumberInfo,
  listMessageTemplatesPreview,
  WhatsappCloudApiError,
} from "@/lib/whatsapp-cloud-api";
import { leerConfigWhatsapp } from "@/lib/whatsapp-config";

const DIAS_PERIODO = 30;

type FilaBroadcast = {
  id: string;
  template_name: string;
  template_language: string;
  template_category: string | null;
  total: number;
  delivered: number;
  failed: number;
  skipped: number;
  status: string;
  created_at: string;
  coste_estimado_usd: number;
};

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = getSupabaseAdmin();
  const desde = new Date();
  desde.setDate(desde.getDate() - DIAS_PERIODO);
  const desdeIso = desde.toISOString();

  let cuenta: {
    display_phone_number: string | null;
    verified_name: string | null;
    quality_rating: string | null;
    messaging_limit_tier: string | null;
    ok: boolean;
    error: string | null;
  } = {
    display_phone_number: null,
    verified_name: null,
    quality_rating: null,
    messaging_limit_tier: null,
    ok: false,
    error: null,
  };

  try {
    const config = await leerConfigWhatsapp();
    const info = await getPhoneNumberInfo(config);
    cuenta = {
      display_phone_number: info.display_phone_number ?? null,
      verified_name: info.verified_name ?? null,
      quality_rating: info.quality_rating ?? null,
      messaging_limit_tier: info.messaging_limit_tier ?? null,
      ok: true,
      error: null,
    };
  } catch (error) {
    const mensaje =
      error instanceof WhatsappCloudApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo obtener el número.";
    cuenta = {
      display_phone_number: null,
      verified_name: null,
      quality_rating: null,
      messaging_limit_tier: null,
      ok: false,
      error: mensaje,
    };
  }

  const configPricing = await leerConfigWhatsapp();

  const { data: broadcastsPeriodo, error: errB } = await supabase
    .from("whatsapp_broadcasts")
    .select(
      "id, template_name, template_language, template_category, total, delivered, failed, skipped, status, created_at, coste_estimado_usd",
    )
    .gte("created_at", desdeIso);
  if (errB) {
    return NextResponse.json({ error: errB.message }, { status: 500 });
  }

  const filas = (broadcastsPeriodo ?? []) as FilaBroadcast[];
  const costePorCategoria: Record<string, { costeUsd: number; enviadosOk: number }> = {};
  for (const f of filas) {
    const cat = (f.template_category ?? "MARKETING").toUpperCase();
    const key =
      cat === "UTILITY" ? "utility" : cat === "AUTHENTICATION" ? "authentication" : "marketing";
    if (!costePorCategoria[key]) {
      costePorCategoria[key] = { costeUsd: 0, enviadosOk: 0 };
    }
    costePorCategoria[key].costeUsd += Number(f.coste_estimado_usd ?? 0);
    costePorCategoria[key].enviadosOk += f.delivered ?? 0;
  }

  const { count: contactosTotal, error: errC } = await supabase
    .from("whatsapp_contacts")
    .select("id", { count: "exact", head: true });
  if (errC) {
    return NextResponse.json({ error: errC.message }, { status: 500 });
  }

  const { count: mensajesSalientes, error: errM } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "out")
    .gte("received_at", desdeIso);
  if (errM) {
    return NextResponse.json({ error: errM.message }, { status: 500 });
  }

  const { data: recientes, error: errR } = await supabase
    .from("whatsapp_broadcasts")
    .select(
      "id, template_name, template_language, template_category, total, delivered, failed, skipped, status, created_at, coste_estimado_usd",
    )
    .order("created_at", { ascending: false })
    .limit(8);
  if (errR) {
    return NextResponse.json({ error: errR.message }, { status: 500 });
  }

  const costeTotalBroadcasts = filas.reduce((acc, f) => acc + Number(f.coste_estimado_usd ?? 0), 0);

  const broadcastsPorEstado: Record<string, number> = {};
  for (const f of filas) {
    const s = f.status ?? "desconocido";
    broadcastsPorEstado[s] = (broadcastsPorEstado[s] ?? 0) + 1;
  }

  const bucketsDia: Record<string, number> = {};
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data: filasMsg, error: errMsgPage } = await supabase
      .from("whatsapp_messages")
      .select("received_at")
      .eq("direction", "out")
      .gte("received_at", desdeIso)
      .order("received_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (errMsgPage) {
      return NextResponse.json({ error: errMsgPage.message }, { status: 500 });
    }
    const chunk = filasMsg ?? [];
    for (const row of chunk) {
      const r = row as { received_at: string };
      const dia = r.received_at.slice(0, 10);
      bucketsDia[dia] = (bucketsDia[dia] ?? 0) + 1;
    }
    if (chunk.length < pageSize) break;
    offset += pageSize;
    if (offset > 200_000) break;
  }

  const mensajesSalientesPorDia: { dia: string; total: number }[] = [];
  const finUtc = new Date();
  for (let i = DIAS_PERIODO - 1; i >= 0; i -= 1) {
    const d = new Date(
      Date.UTC(finUtc.getUTCFullYear(), finUtc.getUTCMonth(), finUtc.getUTCDate() - i),
    );
    const dia = d.toISOString().slice(0, 10);
    mensajesSalientesPorDia.push({ dia, total: bucketsDia[dia] ?? 0 });
  }

  const { data: notifRows, error: errN } = await supabase
    .from("whatsapp_messages")
    .select("received_at, body, to_phone")
    .eq("direction", "out")
    .ilike("body", "[trigger %")
    .order("received_at", { ascending: false })
    .limit(8);
  if (errN) {
    return NextResponse.json({ error: errN.message }, { status: 500 });
  }

  let templatesMetaPreview: Array<{
    name: string;
    language: string;
    status: string;
    category: string;
  }> = [];
  try {
    const preview = await listMessageTemplatesPreview(15, configPricing);
    templatesMetaPreview = preview.map((t) => ({
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category,
    }));
  } catch {
    templatesMetaPreview = [];
  }

  return NextResponse.json({
    cuenta,
    pricing: configPricing.pricing,
    periodoDias: DIAS_PERIODO,
    costePorCategoria,
    costeTotalEstimadoBroadcastsUsd: Number(costeTotalBroadcasts.toFixed(4)),
    contactosTotal: contactosTotal ?? 0,
    mensajesSalientesPeriodo: mensajesSalientes ?? 0,
    mensajesSalientesPorDia,
    broadcastsPorEstado,
    templatesMetaPreview,
    notificacionesTriggerRecientes: notifRows ?? [],
    broadcastsRecientes: recientes ?? [],
  });
}
