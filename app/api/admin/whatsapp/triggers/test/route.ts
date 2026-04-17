import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import {
  dispararTriggerCarritoAbandonado,
  dispararTriggerPedido,
  type TriggerKey,
} from "@/lib/whatsapp-woo-triggers";

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: { triggerKey?: string; orderId?: number; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const triggerKey = body.triggerKey as TriggerKey | undefined;
  if (!triggerKey) return NextResponse.json({ error: "Falta triggerKey." }, { status: 400 });

  try {
    if (triggerKey === "cart_abandoned") {
      const payload = body.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return NextResponse.json({ error: "Para cart_abandoned enviá payload (objeto JSON)." }, { status: 400 });
      }
      const resultado = await dispararTriggerCarritoAbandonado({ payload: payload as Record<string, unknown> });
      return NextResponse.json(resultado);
    }

    if (!body.orderId || typeof body.orderId !== "number") {
      return NextResponse.json({ error: "Falta orderId." }, { status: 400 });
    }

    const resultado = await dispararTriggerPedido({ orderId: body.orderId, triggerKey });
    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error disparando trigger.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
