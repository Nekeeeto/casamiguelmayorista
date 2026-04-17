import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { dispararTriggerPedido, type TriggerKey } from "@/lib/whatsapp-woo-triggers";

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: { triggerKey?: string; orderId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const triggerKey = body.triggerKey as TriggerKey | undefined;
  if (!triggerKey) return NextResponse.json({ error: "Falta triggerKey." }, { status: 400 });
  if (!body.orderId || typeof body.orderId !== "number") {
    return NextResponse.json({ error: "Falta orderId." }, { status: 400 });
  }

  try {
    const resultado = await dispararTriggerPedido({ orderId: body.orderId, triggerKey });
    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error disparando trigger.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
