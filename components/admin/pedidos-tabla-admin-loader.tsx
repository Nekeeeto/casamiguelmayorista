"use client";

import type { VistaPedidosAdminMeta } from "@/lib/pedidos-admin-listado";
import type { WooPedidoAdmin } from "@/lib/woo-pedido-admin-types";

import { PedidosTablaAdmin } from "./pedidos-tabla-admin";

export function PedidosTablaAdminLoader({
  pedidosIniciales,
  meta,
}: {
  pedidosIniciales: WooPedidoAdmin[];
  meta: VistaPedidosAdminMeta;
}) {
  return <PedidosTablaAdmin pedidosIniciales={pedidosIniciales} meta={meta} />;
}
