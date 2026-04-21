import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse, after } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  TRIGGER_KEYS_PEDIDO,
  dispararTriggerPedido,
  normalizarSlugEstadoWebhook,
  resolverTriggerKeyParaEstadoWoo,
  type FilaTriggerPedidoWoo,
} from "@/lib/whatsapp-woo-triggers";

export const runtime = "nodejs";

function verifyWooSignature(rawBody: string, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type OrderPayload = {
  id?: number;
  status?: string;
  order?: { status?: string };
  date_modified?: string;
  meta_data?: { key?: string; value?: unknown }[];
};

function extraerEstadoPedidoDesdePayload(payload: OrderPayload): string | undefined {
  if (typeof payload.status === "string" && payload.status.trim()) return payload.status;
  const nested = payload.order?.status;
  if (typeof nested === "string" && nested.trim()) return nested;
  return undefined;
}

export async function POST(req: Request) {
  const secret = process.env.WOO_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing WOO_WEBHOOK_SECRET env var" }, { status: 500 });
  }

  const signature = req.headers.get("x-wc-webhook-signature") ?? "";
  const rawBody = await req.text();
  if (!signature || !verifyWooSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: OrderPayload;
  try {
    payload = JSON.parse(rawBody) as OrderPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const orderId = Number(payload.id);
  const nuevoEstado = extraerEstadoPedidoDesdePayload(payload);
  if (!orderId || !nuevoEstado) return NextResponse.json({ ok: true });

  after(async () => {
    try {
      const supabase = getSupabaseAdmin();
      const { data: previo } = await supabase
        .from("whatsapp_woo_order_status")
        .select("status")
        .eq("order_id", orderId)
        .maybeSingle<{ status: string }>();
      const estadoAnterior = previo?.status;

      const { data: filasTriggers, error: errFilas } = await supabase
        .from("whatsapp_triggers")
        .select("trigger_key, woo_status_slugs")
        .in("trigger_key", [...TRIGGER_KEYS_PEDIDO]);
      let filas: FilaTriggerPedidoWoo[];
      if (errFilas) {
        console.error("[woo pedidos webhook] triggers read:", errFilas.message);
        filas = TRIGGER_KEYS_PEDIDO.map((trigger_key) => ({
          trigger_key,
          woo_status_slugs: [],
        }));
      } else {
        filas = (filasTriggers ?? []).map((row) => ({
          trigger_key: row.trigger_key as FilaTriggerPedidoWoo["trigger_key"],
          woo_status_slugs: Array.isArray(row.woo_status_slugs) ? row.woo_status_slugs : [],
        }));
      }
      const trigger = resolverTriggerKeyParaEstadoWoo(nuevoEstado, estadoAnterior, filas);
      if (trigger) {
        await dispararTriggerPedido({ orderId, triggerKey: trigger }).catch((err) => {
          console.error("[woo pedidos webhook] trigger error:", err);
        });
      } else {
        console.info("[woo pedidos webhook] sin trigger", {
          orderId,
          nuevoEstado,
          estadoAnterior: previo?.status ?? null,
        });
      }

      const statusCanonico = normalizarSlugEstadoWebhook(nuevoEstado);
      await supabase
        .from("whatsapp_woo_order_status")
        .upsert({ order_id: orderId, status: statusCanonico }, { onConflict: "order_id" });
    } catch (error) {
      console.error("[woo pedidos webhook] error async:", error);
    }
  });

  return NextResponse.json({ ok: true });
}
