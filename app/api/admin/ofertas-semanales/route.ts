import { NextResponse } from "next/server";

import {
  construirDetalleManualDesdeIds,
  ejecutarRotacionOfertasSemanales,
  guardarOfertasManuales,
  leerEstadoOfertasSemanales,
} from "@/lib/ofertas-semanales";
import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const supabase = getSupabaseAdmin();
    const estado = await leerEstadoOfertasSemanales(supabase);
    return NextResponse.json({ estado });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error leyendo estado.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CuerpoPost =
  | { action: "rotate"; pushWoo?: boolean }
  | {
      action: "saveManual";
      pushWoo?: boolean;
      items: { woo_product_id: number; precio_oferta?: number; razon?: string }[];
    };

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let body: CuerpoPost;
  try {
    body = (await req.json()) as CuerpoPost;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const pushWoo = body.pushWoo !== false;

  try {
    const supabase = getSupabaseAdmin();

    if (body.action === "rotate") {
      const resultado = await ejecutarRotacionOfertasSemanales({ supabase, pushWoo });
      if (!resultado.ok) {
        return NextResponse.json({ error: resultado.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, estado: resultado.estado });
    }

    if (body.action === "saveManual") {
      const construido = await construirDetalleManualDesdeIds(supabase, body.items ?? []);
      if (!construido.ok) {
        return NextResponse.json({ error: construido.error }, { status: 400 });
      }
      const resultado = await guardarOfertasManuales({
        supabase,
        pushWoo,
        detalle: construido.detalle,
        narrativa_resumen:
          "Listado guardado manualmente desde Herramientas › Ofertas semanales (validación de costo > 0 y exclusiones Pirotecnía/Estadio).",
      });
      if (!resultado.ok) {
        return NextResponse.json({ error: resultado.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, estado: resultado.estado });
    }

    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error en ofertas semanales.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
