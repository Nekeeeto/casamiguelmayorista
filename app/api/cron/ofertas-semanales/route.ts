import { NextResponse } from "next/server";

import { ejecutarRotacionOfertasSemanales } from "@/lib/ofertas-semanales";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function isAuthorized(req: Request) {
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (isVercelCron) {
    return true;
  }

  const expectedToken = process.env.WHOLESALE_SYNC_TOKEN;
  if (!expectedToken) {
    return false;
  }

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${expectedToken}`;
}

async function ejecutar(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const resultado = await ejecutarRotacionOfertasSemanales({ supabase, pushWoo: true });
    if (!resultado.ok) {
      return NextResponse.json({ ok: false, error: resultado.error }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      rotated_at: resultado.estado.rotated_at,
      productos: resultado.estado.woo_product_ids.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Vercel Cron invoca GET por defecto. */
export async function GET(req: Request) {
  return ejecutar(req);
}

export async function POST(req: Request) {
  return ejecutar(req);
}
