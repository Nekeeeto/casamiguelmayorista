import { timingSafeEqual } from "node:crypto";

import { NextResponse, after } from "next/server";

import { dispararTriggerCarritoAbandonado } from "@/lib/whatsapp-woo-triggers";

export const runtime = "nodejs";

function igualdadSegura(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function POST(req: Request) {
  const secret = process.env.FUNNELKIT_CART_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing FUNNELKIT_CART_WEBHOOK_SECRET env var" }, { status: 500 });
  }

  const header = req.headers.get("x-funnelkit-secret")?.trim();
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  const proporcionado = header ?? bearer ?? token;
  if (!proporcionado || !igualdadSegura(proporcionado, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  after(async () => {
    try {
      const r = await dispararTriggerCarritoAbandonado({ payload });
      if (!r.ok) {
        console.error("[funnelkit cart] disparo:", r.motivo);
      }
    } catch (error) {
      console.error("[funnelkit cart] error:", error);
    }
  });

  return NextResponse.json({ ok: true });
}
