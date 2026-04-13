import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResumenVentasWeb } from "@/lib/analiticas-ventas-web";

function formatoMoneda(valor: number) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(valor);
}

type Props = {
  desde: string;
  hasta: string;
  estadosPedidoWooResumen: string;
  resumen: ResumenVentasWeb;
  categoriaFiltroEtiqueta: string | null;
};

export function AnaliticasVentasWebMetaTecnica({
  desde,
  hasta,
  estadosPedidoWooResumen,
  resumen,
  categoriaFiltroEtiqueta,
}: Props) {
  return (
    <Card className="border-dashed border-border bg-muted/15">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-foreground">WooCommerce, API y totales del pedido</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs text-muted-foreground">
        <p>
          Estados Woo incluidos:{" "}
          <span className="font-mono text-foreground">{estadosPedidoWooResumen}</span>. Periodo{" "}
          <span className="text-foreground">
            {desde} → {hasta}
          </span>{" "}
          (GMT según Woo).
        </p>
        <p>
          Pedidos con al menos una línea de producto contada:{" "}
          <span className="tabular-nums text-foreground">{resumen.pedidos}</span>. Pedidos devueltos por la API en el
          rango: <span className="tabular-nums text-foreground">{resumen.pedidosDescargados}</span>.
          {categoriaFiltroEtiqueta ? (
            <>
              {" "}
              Con filtro de categoría, solo entran líneas cuyo producto pertenece al árbol elegido.
            </>
          ) : null}
        </p>
        <p className="border-t border-border pt-3">
          Referencia desde totales del pedido en Woo: suma de <span className="text-foreground">order.total</span>{" "}
          en pedidos con línea incluida:{" "}
          <span className="tabular-nums text-foreground">{formatoMoneda(resumen.totalPedidosWoo)}</span>. Envío
          sumado en esos pedidos:{" "}
          <span className="tabular-nums text-foreground">{formatoMoneda(resumen.envioTotal)}</span>. Reembolsos
          (valor absoluto agregado):{" "}
          <span className="tabular-nums text-foreground">{formatoMoneda(resumen.reembolsosTotal)}</span>. Venta neta sin
          envío (líneas − reembolsos, aprox.):{" "}
          <span className="tabular-nums text-foreground">{formatoMoneda(resumen.ventaNetaSinEnvio)}</span>. Con envío:{" "}
          <span className="tabular-nums text-foreground">{formatoMoneda(resumen.ventaNetaConEnvio)}</span>.
        </p>
        <p>
          Las tarjetas superiores de ingreso y margen usan solo{" "}
          <span className="text-foreground">líneas de producto</span> (sin fees ni envío a nivel pedido), alineado con la
          definición del inventario mayorista para costo.
        </p>
      </CardContent>
    </Card>
  );
}
