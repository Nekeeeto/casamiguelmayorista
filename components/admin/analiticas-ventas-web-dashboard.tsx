"use client";

import Image from "next/image";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ResultadoAnaliticasVentasWeb } from "@/lib/analiticas-ventas-web";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PRODUCTOS_POR_PAGINA = 20;

type Props = {
  datos: ResultadoAnaliticasVentasWeb;
  categoriaFiltroEtiqueta?: string | null;
};

function formatoMoneda(valor: number) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(valor);
}

function formatoMonedaTicket(valor: number) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(valor);
}

const estiloTooltip = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  fontSize: "12px",
} as const;

function formatoTooltipValor(valor: number | string | (number | string)[]) {
  const n = Array.isArray(valor) ? Number(valor[0]) : Number(valor);
  return Number.isFinite(n) ? formatoMoneda(n) : String(valor);
}

export function AnaliticasVentasWebDashboard({ datos, categoriaFiltroEtiqueta = null }: Props) {
  const { resumen, porDia, porProducto, porCategoria, truncado, productosSinCostoConfigurado } =
    datos;

  const [paginaProductos, setPaginaProductos] = useState(1);
  const totalPaginasProductos = Math.max(1, Math.ceil(porProducto.length / PRODUCTOS_POR_PAGINA));
  const paginaProductosClamped = Math.min(paginaProductos, totalPaginasProductos);
  const inicioProductos = (paginaProductosClamped - 1) * PRODUCTOS_POR_PAGINA;
  const productosPagina = porProducto.slice(
    inicioProductos,
    inicioProductos + PRODUCTOS_POR_PAGINA,
  );

  const productosGrafico = porProducto.slice(0, 12).map((p) => ({
    nombre:
      p.nombre.length > 28 ? `${p.nombre.slice(0, 26)}…` : p.nombre,
    ingresos: p.ingresos,
    margen: p.margen,
  }));

  const categoriasGrafico = porCategoria.slice(0, 10).map((c) => ({
    nombre: c.nombre.length > 22 ? `${c.nombre.slice(0, 20)}…` : c.nombre,
    margen: c.margen,
    ingresos: c.ingresos,
  }));

  return (
    <div className="space-y-6">
      {truncado ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Se alcanzó el límite de páginas al leer pedidos desde Woo. Acortá el rango de fechas o
          contactá para sincronizar pedidos en caché.
        </div>
      ) : null}

      {productosSinCostoConfigurado > 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {productosSinCostoConfigurado} producto(s) con ventas en el periodo tienen costo 0 o sin
          fila en inventario: el margen queda igual al ingreso. Completá{" "}
          <span className="text-foreground">Costo</span> en Inventario para afinar ganancias.
        </div>
      ) : null}

      {categoriaFiltroEtiqueta ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Vista filtrada por categoría{" "}
          <span className="font-medium text-foreground">{categoriaFiltroEtiqueta}</span> (incluye
          subcategorías según el árbol en caché). Solo cuentan productos que tengan alguna de esas
          categorías asignadas en el catálogo sincronizado.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Pedidos (Woo)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{resumen.pedidos}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Pedidos Woo válidos en el periodo. Estados de la API, totales del pedido y envíos/reembolsos están en{" "}
            <span className="text-foreground">Herramientas técnicas</span> al final del panel.
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Ingresos (líneas)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatoMoneda(resumen.ingresos)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Suma de totales por ítem; sin envío ni fees a nivel pedido.
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Costo estimado</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatoMoneda(resumen.costo)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Unidades × precio_costo del inventario mayorista (mismo SKU / producto Woo).
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Margen</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-foreground">
              {formatoMoneda(resumen.margen)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {resumen.margenPct != null
              ? `${resumen.margenPct}% sobre ingresos de líneas`
              : "Sin ingresos en el periodo"}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Envío (pedidos incluidos)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatoMoneda(resumen.envioTotal)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Suma de <span className="text-foreground">shipping_total</span> en pedidos con al menos
            una línea contada (según filtro).
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Reembolsos</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatoMoneda(resumen.reembolsosTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Suma de importes de reembolsos en esos pedidos (valor absoluto). Aproximación a nivel
            pedido, no prorrateada por línea.
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Venta neta (sin envío)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatoMoneda(resumen.ventaNetaSinEnvio)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Ingresos por líneas incluidas menos reembolsos del pedido.
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Venta neta (con envío)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatoMoneda(resumen.ventaNetaConEnvio)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Ingresos líneas + envío del pedido − reembolsos.
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Ticket promedio</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {resumen.ticketPromedio != null
                ? formatoMonedaTicket(resumen.ticketPromedio)
                : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Promedio del total del pedido en Woo (<span className="text-foreground">order.total</span>
            ) entre pedidos con línea incluida.
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Evolución diaria</CardTitle>
          <CardDescription>Ingresos, costo y margen por día (GMT, fecha del pedido).</CardDescription>
        </CardHeader>
        <CardContent className="h-[320px] w-full min-w-0 pt-2">
          {porDia.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay líneas de producto en este rango.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={porDia} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="dia"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickMargin={8}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(v) => formatoMoneda(Number(v))}
                  width={72}
                />
                <Tooltip
                  formatter={(valor, nombre) => [formatoTooltipValor(valor), nombre]}
                  contentStyle={estiloTooltip}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="ingresos"
                  name="Ingresos"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="costo"
                  name="Costo"
                  stroke="hsl(var(--muted-foreground))"
                  fill="hsl(var(--muted-foreground))"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="margen"
                  name="Margen"
                  stroke="hsl(var(--accent))"
                  fill="hsl(var(--accent))"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Margen por categoría</CardTitle>
            <CardDescription>
              Primera categoría del producto en caché; líneas sin categoría van a &quot;Sin
              categoría&quot;.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] w-full min-w-0">
            {categoriasGrafico.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoriasGrafico}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) => formatoMoneda(Number(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="nombre"
                    width={100}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(valor, nombre) => [formatoTooltipValor(valor), nombre]}
                    contentStyle={estiloTooltip}
                  />
                  <Bar dataKey="margen" name="Margen" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Top productos (ingresos)</CardTitle>
            <CardDescription>Hasta 12 productos con mayor facturación en líneas.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] w-full min-w-0">
            {productosGrafico.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productosGrafico} margin={{ top: 4, right: 8, left: 0, bottom: 64 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="nombre"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    angle={-28}
                    textAnchor="end"
                    height={72}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) => formatoMoneda(Number(v))}
                    width={68}
                  />
                  <Tooltip
                  formatter={(valor, nombre) => [formatoTooltipValor(valor), nombre]}
                  contentStyle={estiloTooltip}
                />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="margen" name="Margen" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Detalle por producto</CardTitle>
          <CardDescription>
            {resumen.lineas} líneas agregadas · orden por ingresos · {PRODUCTOS_POR_PAGINA} por
            página.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="w-14 px-2 py-2 text-left font-medium" aria-label="Imagen" />
                <th className="px-3 py-2 text-left font-medium">Producto</th>
                <th className="px-3 py-2 text-left font-medium">SKU</th>
                <th className="px-3 py-2 text-right font-medium">Uds.</th>
                <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                <th className="px-3 py-2 text-right font-medium">Costo</th>
                <th className="px-3 py-2 text-right font-medium">Margen</th>
              </tr>
            </thead>
            <tbody>
              {productosPagina.map((fila) => (
                <tr key={fila.woo_product_id} className="border-t border-border/80">
                  <td className="px-2 py-2 align-middle">
                    <div className="size-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted/30">
                      {fila.image_url ? (
                        <Image
                          src={fila.image_url}
                          alt={fila.nombre}
                          width={48}
                          height={48}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="max-w-[220px] px-3 py-2 font-medium">{fila.nombre}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fila.sku ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {fila.unidades}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoMoneda(fila.ingresos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatoMoneda(fila.costo)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoMoneda(fila.margen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {porProducto.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sin productos en el periodo.</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
              <span className="tabular-nums">
                Página {paginaProductosClamped} de {totalPaginasProductos} · {porProducto.length}{" "}
                productos
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaProductosClamped <= 1}
                  onClick={() => setPaginaProductos((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaProductosClamped >= totalPaginasProductos}
                  onClick={() => setPaginaProductos((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Detalle por categoría</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Categoría</th>
                <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                <th className="px-3 py-2 text-right font-medium">Costo</th>
                <th className="px-3 py-2 text-right font-medium">Margen</th>
              </tr>
            </thead>
            <tbody>
              {porCategoria.map((fila) => (
                <tr key={fila.categoria_id} className="border-t border-border/80">
                  <td className="px-3 py-2 font-medium">{fila.nombre}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoMoneda(fila.ingresos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatoMoneda(fila.costo)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoMoneda(fila.margen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {porCategoria.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sin categorías en el periodo.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
