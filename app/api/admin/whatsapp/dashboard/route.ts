import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getPhoneNumberInfo, WhatsappCloudApiError } from "@/lib/whatsapp-cloud-api";
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

  return NextResponse.json({
    cuenta,
    pricing: configPricing.pricing,
    periodoDias: DIAS_PERIODO,
    costePorCategoria,
    costeTotalEstimadoBroadcastsUsd: Number(costeTotalBroadcasts.toFixed(4)),
    contactosTotal: contactosTotal ?? 0,
    mensajesSalientesPeriodo: mensajesSalientes ?? 0,
    broadcastsRecientes: recientes ?? [],
  });
}
