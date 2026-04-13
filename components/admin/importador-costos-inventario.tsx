"use client";

import { useActionState, useCallback, useEffect, useState } from "react";

import { importarCostosCsvAction } from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseCsvConEncabezados } from "@/lib/csv-utils";

type FilaHistorial = {
  id: string;
  created_at: string;
  nombre_archivo: string | null;
  mapeo: { columna_sku_idx?: number; columna_costo_idx?: number; columna_proveedor_idx?: number | null };
  resultado: Record<string, unknown>;
};

type RespuestaHistorial = { ok: true; filas: FilaHistorial[] } | { ok: false; error: string };

type PropsImportador = {
  /** Sin borde superior ni margen extra (p. ej. dentro del panel técnico). */
  embebido?: boolean;
};

export function ImportadorCostosInventario({ embebido = false }: PropsImportador) {
  const [estado, formAction, pendiente] = useActionState(importarCostosCsvAction, null);

  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [vistaPrevia, setVistaPrevia] = useState<string[][]>([]);
  const [nombreArchivo, setNombreArchivo] = useState<string>("");
  const [historial, setHistorial] = useState<FilaHistorial[]>([]);
  const [historialCargando, setHistorialCargando] = useState(false);

  const cargarHistorial = useCallback(() => {
    setHistorialCargando(true);
    void fetch("/api/admin/inventario/importaciones", { credentials: "same-origin" })
      .then(async (r) => {
        const cuerpo = (await r.json()) as RespuestaHistorial;
        if (!r.ok || !cuerpo.ok) {
          setHistorial([]);
          return;
        }
        setHistorial(cuerpo.filas);
      })
      .catch(() => setHistorial([]))
      .finally(() => setHistorialCargando(false));
  }, []);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  useEffect(() => {
    if (estado?.ok === true) {
      cargarHistorial();
    }
  }, [estado, cargarHistorial]);

  function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setEncabezados([]);
      setVistaPrevia([]);
      setNombreArchivo("");
      return;
    }
    setNombreArchivo(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const texto = typeof reader.result === "string" ? reader.result : "";
      const { encabezados: h, filas } = parseCsvConEncabezados(texto);
      setEncabezados(h);
      setVistaPrevia(filas.slice(0, 4));
    };
    reader.readAsText(file, "UTF-8");
  }

  return (
    <div
      className={
        embebido ? "space-y-4" : "mt-8 space-y-4 border-t border-border pt-6"
      }
    >
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Importar costos (CSV)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            El SKU del archivo debe coincidir con el de la tienda (mayúsculas ignoradas). Elegí columnas de SKU y
            costo; opcionalmente <span className="text-foreground">proveedor</span> por nombre fantasía (si no existe,
            se crea). Costos con punto decimal tipo 12,99 o 12.99; miles tipo 1.234,56. Solo se actualiza el canal
            mayorista.
          </p>
        </div>

        <form action={formAction} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="import-csv-archivo">Archivo (.csv)</Label>
              <Input
                id="import-csv-archivo"
                name="archivo"
                type="file"
                accept=".csv,text/csv,text/plain"
                required
                disabled={pendiente}
                onChange={alElegirArchivo}
                className="cursor-pointer text-sm"
              />
              {nombreArchivo ? (
                <p className="text-xs text-muted-foreground">Seleccionado: {nombreArchivo}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-csv-sku">Columna → SKU</Label>
              <select
                key={`sku-${nombreArchivo}`}
                id="import-csv-sku"
                name="columna_sku_idx"
                required
                disabled={pendiente || encabezados.length === 0}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                defaultValue=""
              >
                <option value="" disabled>
                  {encabezados.length ? "Elegí columna…" : "Subí un CSV primero"}
                </option>
                {encabezados.map((h, i) => (
                  <option key={i} value={String(i)}>
                    {h.length > 0 ? h : `Columna ${i + 1} (vacía)`}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-csv-costo">Columna → Costo</Label>
              <select
                key={`costo-${nombreArchivo}`}
                id="import-csv-costo"
                name="columna_costo_idx"
                required
                disabled={pendiente || encabezados.length === 0}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                defaultValue=""
              >
                <option value="" disabled>
                  {encabezados.length ? "Elegí columna…" : "Subí un CSV primero"}
                </option>
                {encabezados.map((h, i) => (
                  <option key={i} value={String(i)}>
                    {h.length > 0 ? h : `Columna ${i + 1} (vacía)`}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-csv-proveedor">Columna → Proveedor (opcional)</Label>
              <select
                key={`prov-${nombreArchivo}`}
                id="import-csv-proveedor"
                name="columna_proveedor_idx"
                disabled={pendiente || encabezados.length === 0}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                defaultValue="__sin__"
              >
                <option value="__sin__">No importar proveedor</option>
                {encabezados.map((h, i) => (
                  <option key={i} value={String(i)}>
                    {h.length > 0 ? h : `Columna ${i + 1} (vacía)`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {vistaPrevia.length > 0 && encabezados.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                Vista previa (primeras filas)
              </p>
              <table className="w-full min-w-[480px] text-xs">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    {encabezados.map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left font-medium">
                        {h || `Col ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vistaPrevia.map((fila, ri) => (
                    <tr key={ri} className="border-t border-border/80">
                      {encabezados.map((_, ci) => (
                        <td key={ci} className="max-w-[200px] truncate px-2 py-1.5">
                          {fila[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <Button type="submit" disabled={pendiente || encabezados.length === 0}>
            {pendiente ? "Importando…" : "Aplicar importación"}
          </Button>
        </form>

        {estado?.ok === false ? (
          <div
            className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {estado.error}
          </div>
        ) : null}

        {estado?.ok === true ? (
          <div
            className="mt-4 space-y-2 rounded-md border border-border bg-card px-3 py-3 text-sm text-muted-foreground"
            role="status"
          >
            <p className="font-medium text-foreground">Importación lista</p>
            <ul className="list-inside list-disc space-y-1 text-xs">
              <li>
                Productos actualizados (costo / proveedor según mapeo):{" "}
                <span className="tabular-nums text-foreground">{estado.detalle.actualizados}</span>
              </li>
              <li>
                Filas nuevas en mayorista:{" "}
                <span className="tabular-nums text-foreground">{estado.detalle.creados}</span>
              </li>
              <li>
                SKUs con costo en el CSV:{" "}
                <span className="tabular-nums text-foreground">{estado.detalle.filasCsvConCosto}</span>
              </li>
              <li>
                Filas omitidas (sin costo válido):{" "}
                <span className="tabular-nums text-foreground">{estado.detalle.omitidasSinCosto}</span>
              </li>
              <li>
                SKUs del CSV sin coincidencia en catálogo:{" "}
                <span className="tabular-nums text-foreground">{estado.detalle.sinMatchEnCatalogo}</span>
              </li>
              <li>
                Filas con celda de proveedor no vacía:{" "}
                <span className="tabular-nums text-foreground">{estado.detalle.filasConProveedorCsv}</span>
              </li>
              <li>
                Proveedores nuevos creados en BD:{" "}
                <span className="tabular-nums text-foreground">{estado.detalle.proveedoresCreadosEnDb}</span>
              </li>
              {estado.detalle.duplicadosSkuEnCsv > 0 ? (
                <li>
                  SKU repetidos en el CSV (quedó el último valor):{" "}
                  <span className="tabular-nums text-foreground">{estado.detalle.duplicadosSkuEnCsv}</span>
                </li>
              ) : null}
            </ul>
            {estado.detalle.muestraSinMatch.length > 0 ? (
              <p className="text-xs">
                Ejemplos sin coincidencia en catálogo:{" "}
                <span className="text-foreground">{estado.detalle.muestraSinMatch.join(", ")}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Historial de importaciones</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => cargarHistorial()} disabled={historialCargando}>
            {historialCargando ? "Cargando…" : "Actualizar"}
          </Button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Registro de cada ejecución (requiere tabla <code className="text-foreground">importaciones_inventario_csv</code>{" "}
          en Supabase — ver <code className="text-foreground">schema_phase8_importaciones_csv.sql</code>).
        </p>
        {historial.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {historialCargando ? "Cargando historial…" : "Todavía no hay importaciones registradas."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium">Archivo</th>
                  <th className="px-3 py-2 text-right font-medium">Actualiz.</th>
                  <th className="px-3 py-2 text-right font-medium">Nuevos</th>
                  <th className="px-3 py-2 text-right font-medium">Sin match</th>
                  <th className="px-3 py-2 text-right font-medium">Prov. nuevos</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((fila) => {
                  const r = fila.resultado;
                  const act = Number(r.actualizados ?? 0);
                  const cre = Number(r.creados ?? 0);
                  const sm = Number(r.sinMatchEnCatalogo ?? 0);
                  const pn = Number(r.proveedoresCreadosEnDb ?? 0);
                  const fecha = new Date(fila.created_at).toLocaleString("es-UY", {
                    dateStyle: "short",
                    timeStyle: "short",
                  });
                  return (
                    <tr key={fila.id} className="border-t border-border/80">
                      <td className="px-3 py-2 text-muted-foreground">{fecha}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-foreground">
                        {fila.nombre_archivo ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{act}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cre}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{sm}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pn}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
