/** Tipos mínimos del pedido Woo (REST wc/v3/orders) para el panel admin. */

export type WooDireccionPedido = {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  phone?: string;
  email?: string;
};

export type WooLineItemPedido = {
  id: number;
  name: string;
  quantity: number;
  subtotal: string;
  total: string;
  /** Miniatura del producto (REST wc/v3/orders suele incluir `image` en cada línea). */
  image?: { id?: number; src?: string } | null;
};

/** Línea de envío en REST `orders` (para detectar retiro / local pickup con cualquier estado). */
export type WooShippingLinePedido = {
  method_id?: string;
  method_title?: string;
};

export type WooPedidoAdmin = {
  id: number;
  number?: string;
  status: string;
  date_created: string;
  date_created_gmt?: string;
  currency?: string;
  total: string;
  /** Nota del cliente (REST `customer_note`). */
  customer_note?: string;
  billing?: WooDireccionPedido;
  shipping?: WooDireccionPedido;
  line_items: WooLineItemPedido[];
  /** Incluido por Woo en pedidos con método de envío (retiro en tienda, etc.). */
  shipping_lines?: WooShippingLinePedido[] | null;
};
