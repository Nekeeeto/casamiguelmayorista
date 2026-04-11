"use client";

import { useMemo } from "react";

import type { ProductoInventarioFila } from "@/components/admin/inventario-tabla-productos";
import {
  evaluarAlertasInventario,
  type InventoryHealthAlertKey,
} from "@/lib/inventory-health-evaluate";

export type { InventoryHealthAlertKey };

/**
 * Mapa de alertas por producto para la página actual (filtrado de tabla).
 */
export function useInventoryHealthAlertasPorProducto(productos: ProductoInventarioFila[]) {
  return useMemo(() => {
    const alertsByProduct = new Map<number, Set<InventoryHealthAlertKey>>();
    for (const producto of productos) {
      alertsByProduct.set(
        producto.woo_product_id,
        evaluarAlertasInventario({
          woo_product_id: producto.woo_product_id,
          sku: producto.sku,
          stock_status: producto.stock_status,
          stock_quantity: producto.stock_quantity,
          categoria_ids: producto.categoria_ids,
          precio_costo: producto.mayorista?.precio_costo,
          proveedor_id: producto.mayorista?.proveedor_id,
        }),
      );
    }
    return alertsByProduct;
  }, [productos]);
}
