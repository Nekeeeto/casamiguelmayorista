import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  deleteWooProductsCache,
  upsertWooProductsCache,
} from "@/lib/catalog-sync";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchWooProductById, type WooProduct } from "@/lib/woo";

function verifyWooSignature(rawBody: string, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

type WebhookProductPayload = {
  id?: number;
  status?: string;
  name?: string;
  sku?: string;
};

export async function POST(req: Request) {
  try {
    const webhookSecret = process.env.WOO_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json(
        { error: "Missing WOO_WEBHOOK_SECRET env var" },
        { status: 500 },
      );
    }

    const signature = req.headers.get("x-wc-webhook-signature") ?? "";
    const topic = req.headers.get("x-wc-webhook-topic") ?? "";
    const rawBody = await req.text();

    if (!signature || !verifyWooSignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as WebhookProductPayload;
    const productId = Number(payload?.id);

    if (!productId) {
      return NextResponse.json({ error: "Invalid product payload" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const topicLower = topic.toLowerCase();
    const isDeleteEvent =
      topicLower.includes("deleted") || payload.status === "trash";

    if (isDeleteEvent) {
      await deleteWooProductsCache(supabaseAdmin, [productId]);
      return NextResponse.json({ ok: true, action: "deleted", productId });
    }

    const freshProduct = (await fetchWooProductById(productId)) as WooProduct;
    await upsertWooProductsCache(supabaseAdmin, [freshProduct]);

    return NextResponse.json({ ok: true, action: "upserted", productId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
