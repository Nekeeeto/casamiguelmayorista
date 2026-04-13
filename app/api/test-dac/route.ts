import { NextResponse } from "next/server";

import { fetchWooOrderRawById } from "@/lib/woo";

const ORDER_ID_DEFAULT = 33411;

function isAuthorized(req: Request) {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  const expected = process.env.WHOLESALE_SYNC_TOKEN;
  if (!expected) {
    return false;
  }
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

/**
 * Temporal: GET /api/test-dac — imprime en la terminal del servidor `meta_data` del pedido Woo.
 * Quitar cuando ya no haga falta inspeccionar el plugin de envíos.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const orderId = Number(url.searchParams.get("orderId") ?? ORDER_ID_DEFAULT);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "orderId inválido" }, { status: 400 });
  }

  try {
    const order = await fetchWooOrderRawById(orderId);
    const metaData = order.meta_data;

    console.log(`[test-dac] Pedido Woo #${orderId} — meta_data (array completo):`);
    console.log(JSON.stringify(metaData, null, 2));

    const resumen = Array.isArray(metaData)
      ? metaData.map((entry: unknown) => {
          const row = entry as { id?: number; key?: string; value?: unknown };
          return { id: row.id, key: row.key, value: row.value };
        })
      : [];

    return NextResponse.json({
      ok: true,
      order_id: orderId,
      meta_data_length: Array.isArray(metaData) ? metaData.length : 0,
      /** Misma info que en consola, por si mirás la respuesta en el navegador. */
      meta_data_keys_values: resumen,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al leer el pedido en Woo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
