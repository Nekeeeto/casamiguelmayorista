import type { WooOrder } from "@/lib/woo-orders";

export type InfoProductoCache = {
  name: string;
  sku: string | null;
  categoria_ids: number[];
  image_url: string | null;
};

export type FilaDiaVentasWeb = {
  dia: string;
  ingresos: number;
  costo: number;
  margen: number;
};

export type FilaProductoVentasWeb = {
  woo_product_id: number;
  nombre: string;
  sku: string | null;
  image_url: string | null;
  unidades: number;
  ingresos: number;
  costo: number;
  margen: number;
};

export type FilaCategoriaVentasWeb = {
  categoria_id: number;
  nombre: string;
  ingresos: number;
  costo: number;
  margen: number;
};

export type ResumenVentasWeb = {
  /** Pedidos con al menos una línea incluida (según filtro de categoría). */
  pedidos: number;
  /** Pedidos devueltos por la API en el rango (sin filtrar por categoría en el conteo). */
  pedidosDescargados: number;
  lineas: number;
  /** Suma de line_items[].total (solo líneas incluidas). */
  ingresos: number;
  costo: number;
  margen: number;
  margenPct: number | null;
  /** Suma de shipping_total en pedidos que aportaron al menos una línea. */
  envioTotal: number;
  /** Suma de importes absolutos de refunds[] en esos pedidos (Woo suele enviar totales negativos). */
  reembolsosTotal: number;
  /** Suma de order.total en esos pedidos (referencia Woo; puede incluir impuestos/descuentos). */
  totalPedidosWoo: number;
  /** ingresos líneas − reembolsos (aprox.; reembolsos son a nivel pedido). */
  ventaNetaSinEnvio: number;
  /** ingresos líneas + envío − reembolsos. */
  ventaNetaConEnvio: number;
  /** Promedio de total del pedido Woo entre pedidos con línea incluida. */
  ticketPromedio: number | null;
};

export type ResultadoAnaliticasVentasWeb = {
  resumen: ResumenVentasWeb;
  porDia: FilaDiaVentasWeb[];
  porProducto: FilaProductoVentasWeb[];
  porCategoria: FilaCategoriaVentasWeb[];
  truncado: boolean;
  /** Productos distintos con venta en el periodo y costo en caché = 0 (revisar precio_costo en inventario). */
  productosSinCostoConfigurado: number;
};

export type OpcionesAgregarVentasWeb = {
  /** Si está definido y no vacío, solo líneas cuyo producto tenga alguna categoría en el set (p. ej. árbol completo de "Golosinas"). */
  idsCategoriaPermitidos: Set<number> | null;
};

function parseDinero(valor: string | undefined): number {
  if (valor === undefined || valor === null) {
    return 0;
  }
  const n = Number.parseFloat(String(valor).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Number(n.toFixed(2));
}

/** Importe con signo (totales Woo, reembolsos). */
function parseImporte(valor: string | undefined): number {
  if (valor === undefined || valor === null) {
    return 0;
  }
  const n = Number.parseFloat(String(valor).replace(",", "."));
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Number(n.toFixed(2));
}

function diaDesdeGmt(dateCreatedGmt: string): string {
  if (!dateCreatedGmt || dateCreatedGmt.length < 10) {
    return "1970-01-01";
  }
  return dateCreatedGmt.slice(0, 10);
}

function redondearResumen(n: number): number {
  return Number(n.toFixed(2));
}

function lineaPasaFiltroCategoria(
  meta: InfoProductoCache | undefined,
  permitidos: Set<number> | null,
): boolean {
  if (permitidos == null || permitidos.size === 0) {
    return true;
  }
  const ids = meta?.categoria_ids ?? [];
  return ids.some((id) => permitidos.has(id));
}

type AcumProducto = {
  nombre: string;
  sku: string | null;
  image_url: string | null;
  unidades: number;
  ingresos: number;
  costo: number;
};

/**
 * Agrega líneas de pedido Woo con costo unitario desde mayorista (precio_costo por woo_product_id).
 * Atribución por categoría en tablas: primera categoría del producto en caché.
 * Envío / reembolsos / total Woo: solo pedidos que tengan al menos una línea incluida (tras filtro).
 */
export function agregarVentasWebDesdePedidos(
  orders: WooOrder[],
  costosPorProducto: Map<number, number>,
  infoProducto: Map<number, InfoProductoCache>,
  nombresCategoria: Map<number, string>,
  truncado: boolean,
  opciones: OpcionesAgregarVentasWeb = { idsCategoriaPermitidos: null },
): ResultadoAnaliticasVentasWeb {
  const permitidos = opciones.idsCategoriaPermitidos;

  const porDiaMap = new Map<string, { ingresos: number; costo: number }>();
  const porProductoMap = new Map<number, AcumProducto>();
  const porCategoriaMap = new Map<number, { nombre: string; ingresos: number; costo: number }>();

  let lineas = 0;
  const idsProductoSinCosto = new Set<number>();
  const pedidosConLineaIncluida = new Set<number>();

  for (const pedido of orders) {
    const dia = diaDesdeGmt(pedido.date_created_gmt);
    for (const linea of pedido.line_items ?? []) {
      const productId = linea.product_id;
      if (!Number.isFinite(productId) || productId <= 0) {
        continue;
      }

      const meta = infoProducto.get(productId);
      if (!lineaPasaFiltroCategoria(meta, permitidos)) {
        continue;
      }

      pedidosConLineaIncluida.add(pedido.id);
      lineas += 1;
      const qty = Number(linea.quantity);
      const cantidad = Number.isFinite(qty) && qty > 0 ? qty : 0;
      const ingresoLinea = parseDinero(linea.total);
      const costoUnitario = costosPorProducto.get(productId) ?? 0;
      if (ingresoLinea > 0 && costoUnitario <= 0) {
        idsProductoSinCosto.add(productId);
      }
      const costoLinea = redondearResumen(cantidad * costoUnitario);

      const acumDia = porDiaMap.get(dia) ?? { ingresos: 0, costo: 0 };
      acumDia.ingresos = redondearResumen(acumDia.ingresos + ingresoLinea);
      acumDia.costo = redondearResumen(acumDia.costo + costoLinea);
      porDiaMap.set(dia, acumDia);

      const nombreProducto = meta?.name?.trim() || linea.name || `Producto #${productId}`;
      const skuProducto = meta?.sku ?? null;
      const imagen = meta?.image_url ?? null;

      const acumProd =
        porProductoMap.get(productId) ?? {
          nombre: nombreProducto,
          sku: skuProducto,
          image_url: imagen,
          unidades: 0,
          ingresos: 0,
          costo: 0,
        };
      acumProd.unidades += cantidad;
      acumProd.ingresos = redondearResumen(acumProd.ingresos + ingresoLinea);
      acumProd.costo = redondearResumen(acumProd.costo + costoLinea);
      if (!acumProd.nombre && nombreProducto) {
        acumProd.nombre = nombreProducto;
      }
      if (skuProducto) {
        acumProd.sku = skuProducto;
      }
      if (imagen) {
        acumProd.image_url = imagen;
      }
      porProductoMap.set(productId, acumProd);

      const idsCat = meta?.categoria_ids?.filter((id) => Number.isFinite(id) && id > 0) ?? [];
      const catId = idsCat.length > 0 ? idsCat[0] : 0;
      const nombreCat =
        catId > 0 ? (nombresCategoria.get(catId) ?? `Categoría #${catId}`) : "Sin categoría";

      const acumCat =
        porCategoriaMap.get(catId) ?? { nombre: nombreCat, ingresos: 0, costo: 0 };
      acumCat.ingresos = redondearResumen(acumCat.ingresos + ingresoLinea);
      acumCat.costo = redondearResumen(acumCat.costo + costoLinea);
      porCategoriaMap.set(catId, acumCat);
    }
  }

  let ingresosTotal = 0;
  let costoTotal = 0;
  for (const { ingresos, costo } of porDiaMap.values()) {
    ingresosTotal = redondearResumen(ingresosTotal + ingresos);
    costoTotal = redondearResumen(costoTotal + costo);
  }

  const margenTotal = redondearResumen(ingresosTotal - costoTotal);
  const margenPct =
    ingresosTotal > 0 ? Number(((margenTotal / ingresosTotal) * 100).toFixed(1)) : null;

  let envioTotal = 0;
  let reembolsosTotal = 0;
  let totalPedidosWoo = 0;

  for (const pedido of orders) {
    if (!pedidosConLineaIncluida.has(pedido.id)) {
      continue;
    }
    envioTotal = redondearResumen(envioTotal + parseDinero(pedido.shipping_total));
    totalPedidosWoo = redondearResumen(totalPedidosWoo + parseImporte(pedido.total));
    for (const r of pedido.refunds ?? []) {
      const monto = parseImporte(r.total);
      reembolsosTotal = redondearResumen(reembolsosTotal + Math.abs(monto));
    }
  }

  const ventaNetaSinEnvio = redondearResumen(ingresosTotal - reembolsosTotal);
  const ventaNetaConEnvio = redondearResumen(ingresosTotal + envioTotal - reembolsosTotal);
  const nPedidos = pedidosConLineaIncluida.size;
  const ticketPromedio =
    nPedidos > 0 ? Number((totalPedidosWoo / nPedidos).toFixed(2)) : null;

  const porDia: FilaDiaVentasWeb[] = [...porDiaMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, v]) => ({
      dia,
      ingresos: v.ingresos,
      costo: v.costo,
      margen: redondearResumen(v.ingresos - v.costo),
    }));

  const porProducto: FilaProductoVentasWeb[] = [...porProductoMap.entries()]
    .map(([woo_product_id, v]) => ({
      woo_product_id,
      nombre: v.nombre,
      sku: v.sku,
      image_url: v.image_url,
      unidades: v.unidades,
      ingresos: v.ingresos,
      costo: v.costo,
      margen: redondearResumen(v.ingresos - v.costo),
    }))
    .sort((a, b) => b.ingresos - a.ingresos);

  const porCategoria: FilaCategoriaVentasWeb[] = [...porCategoriaMap.entries()]
    .map(([categoria_id, v]) => ({
      categoria_id,
      nombre: v.nombre,
      ingresos: v.ingresos,
      costo: v.costo,
      margen: redondearResumen(v.ingresos - v.costo),
    }))
    .sort((a, b) => b.margen - a.margen);

  return {
    resumen: {
      pedidos: nPedidos,
      pedidosDescargados: orders.length,
      lineas,
      ingresos: ingresosTotal,
      costo: costoTotal,
      margen: margenTotal,
      margenPct,
      envioTotal,
      reembolsosTotal,
      totalPedidosWoo,
      ventaNetaSinEnvio,
      ventaNetaConEnvio,
      ticketPromedio,
    },
    porDia,
    porProducto,
    porCategoria,
    truncado,
    productosSinCostoConfigurado: idsProductoSinCosto.size,
  };
}
