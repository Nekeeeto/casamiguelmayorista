"use client";

import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { WeeklyOffersStateRow } from "@/lib/ofertas-semanales";

function parseListaNumeros(raw: string): number[] {
  return raw
    .split(/[\s,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function OfertasSemanalesIaSubmenu() {
  const [seccionAbierta, setSeccionAbierta] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [estado, setEstado] = useState<WeeklyOffersStateRow | null>(null);
  const [cargando, setCargando] = useState(false);
  const [accion, setAccion] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pushWoo, setPushWoo] = useState(true);
  const [idsManual, setIdsManual] = useState("");
  const [preciosManual, setPreciosManual] = useState("");
  const [razonManual, setRazonManual] = useState("");

  const refrescar = useCallback(async () => {
    setCargando(true);
    setMensaje(null);
    try {
      const res = await fetch("/api/admin/ofertas-semanales", { credentials: "include" });
      const data = (await res.json()) as { estado?: WeeklyOffersStateRow; error?: string };
      if (!res.ok) {
        setMensaje(data.error ?? "No se pudo cargar el estado.");
        setEstado(null);
        return;
      }
      setEstado(data.estado ?? null);
    } catch {
      setMensaje("Error de red al cargar ofertas.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (modalAbierto) {
      void refrescar();
    }
  }, [modalAbierto, refrescar]);

  async function rotarAhora() {
    setAccion("rotate");
    setMensaje(null);
    try {
      const res = await fetch("/api/admin/ofertas-semanales", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate", pushWoo }),
      });
      const data = (await res.json()) as { ok?: boolean; estado?: WeeklyOffersStateRow; error?: string };
      if (!res.ok) {
        setMensaje(data.error ?? "No se pudo rotar.");
        return;
      }
      setEstado(data.estado ?? null);
      setMensaje("Rotación aplicada correctamente.");
    } catch {
      setMensaje("Error de red al rotar.");
    } finally {
      setAccion(null);
    }
  }

  async function guardarManual() {
    const ids = parseListaNumeros(idsManual);
    const precios = parseListaNumeros(preciosManual);
    if (ids.length < 4 || ids.length > 10) {
      setMensaje("En manual tenés que ingresar entre 4 y 10 IDs Woo.");
      return;
    }
    const items = ids.map((woo_product_id, i) => ({
      woo_product_id,
      precio_oferta: precios[i] > 0 ? precios[i] : undefined,
      razon: razonManual.trim() || undefined,
    }));

    setAccion("save");
    setMensaje(null);
    try {
      const res = await fetch("/api/admin/ofertas-semanales", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveManual", pushWoo, items }),
      });
      const data = (await res.json()) as { ok?: boolean; estado?: WeeklyOffersStateRow; error?: string };
      if (!res.ok) {
        setMensaje(data.error ?? "No se pudo guardar.");
        return;
      }
      setEstado(data.estado ?? null);
      setMensaje("Listado manual guardado.");
    } catch {
      setMensaje("Error de red al guardar.");
    } finally {
      setAccion(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setSeccionAbierta((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/40"
        aria-expanded={seccionAbierta}
      >
        <span className="inline-flex items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
          Ofertas Semanales (rotación IA)
        </span>
        {seccionAbierta ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>

      {seccionAbierta ? (
        <div className="space-y-3 border-t border-border px-4 py-4 text-sm text-muted-foreground">
          <p>
            Cada <strong className="text-foreground">lunes 00:00 (Uruguay)</strong> el cron en Vercel recalcula entre{" "}
            <strong className="text-foreground">4 y 10</strong> productos con costo conocido (&gt; 0), margen
            razonable y bajas ventas históricas en Woo, excluyendo siempre las ramas de categoría con slug{" "}
            <code className="rounded bg-muted px-1 text-foreground">pirotecnia</code> y{" "}
            <code className="rounded bg-muted px-1 text-foreground">estadio</code> (p. ej.{" "}
            <a
              href="https://casamiguel.uy/categoria-producto/pirotecnia/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Pirotecnía
            </a>
            ,{" "}
            <a
              href="https://casamiguel.uy/categoria-producto/estadio/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Estadio
            </a>
            ).
          </p>
          <Dialog open={modalAbierto} onOpenChange={setModalAbierto}>
            <DialogTrigger asChild>
              <Button type="button" variant="secondary" size="sm" className="w-full sm:w-auto">
                Abrir panel de gestión
              </Button>
            </DialogTrigger>
            <DialogContent
              showClose
              className="max-h-[min(90vh,900px)] w-[min(96vw,920px)] max-w-none overflow-y-auto"
            >
              <DialogHeader>
                <DialogTitle>Ofertas Semanales</DialogTitle>
                <DialogDescription>
                  Narrativa global, detalle por producto y acciones. El cron usa la misma lógica que «Rotar ahora».
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Switch id="push-woo" checked={pushWoo} onCheckedChange={setPushWoo} />
                  <Label htmlFor="push-woo" className="text-sm font-normal text-foreground">
                    Aplicar precios de oferta en WooCommerce
                  </Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="default"
                    disabled={accion !== null}
                    onClick={() => void rotarAhora()}
                  >
                    {accion === "rotate" ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                        Rotando…
                      </>
                    ) : (
                      "Rotar ahora"
                    )}
                  </Button>
                  <Button type="button" variant="outline" disabled={cargando} onClick={() => void refrescar()}>
                    {cargando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Refrescar"}
                  </Button>
                </div>
              </div>

              {mensaje ? (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                  {mensaje}
                </p>
              ) : null}

              <div className="space-y-2">
                <Label className="text-foreground">Resumen / narrativa</Label>
                <Textarea
                  readOnly
                  rows={4}
                  className="resize-none bg-muted/30 text-sm"
                  value={estado?.narrativa_resumen ?? "Sin datos. Ejecutá «Refrescar» o corré la migración SQL en Supabase (schema_phase9_weekly_offers.sql)."}
                />
                {estado?.rotated_at ? (
                  <p className="text-xs text-muted-foreground">
                    Última actualización: {new Date(estado.rotated_at).toLocaleString("es-UY")}
                    {estado.week_ends_at
                      ? ` · Ventana sugerida hasta ${new Date(estado.week_ends_at).toLocaleString("es-UY")}`
                      : null}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Productos elegidos y motivo</Label>
                <div className="max-h-64 overflow-auto rounded-md border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/80 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2">ID</th>
                        <th className="px-2 py-2">Nombre</th>
                        <th className="px-2 py-2">Regular</th>
                        <th className="px-2 py-2">Oferta</th>
                        <th className="px-2 py-2">%</th>
                        <th className="px-2 py-2">Ventas Woo</th>
                        <th className="min-w-[200px] px-2 py-2">Razón</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(estado?.ofertas_detalle ?? []).length ? (
                        (estado?.ofertas_detalle ?? []).map((fila) => (
                          <tr key={fila.woo_product_id} className="border-t border-border align-top">
                            <td className="px-2 py-2 font-mono text-foreground">{fila.woo_product_id}</td>
                            <td className="px-2 py-2 text-foreground">{fila.nombre}</td>
                            <td className="px-2 py-2">{fila.precio_regular}</td>
                            <td className="px-2 py-2 font-medium text-foreground">{fila.precio_oferta}</td>
                            <td className="px-2 py-2">-{fila.porcentaje_descuento}%</td>
                            <td className="px-2 py-2">{fila.ventas_historicas}</td>
                            <td className="px-2 py-2 text-muted-foreground">{fila.razon}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                            No hay filas guardadas todavía.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Edición manual</p>
                <p className="text-xs text-muted-foreground">
                  Pegá entre 4 y 10 IDs de producto Woo. Opcionalmente, la segunda caja con el mismo cantidad de
                  precios de oferta (uno por línea o separados por coma). Se valida costo &gt; 0 y exclusiones de
                  categoría.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="ids-manual">IDs Woo</Label>
                    <Textarea
                      id="ids-manual"
                      rows={4}
                      placeholder="123, 456, 789…"
                      value={idsManual}
                      onChange={(e) => setIdsManual(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="precios-manual">Precios oferta (opcional, mismo orden)</Label>
                    <Textarea
                      id="precios-manual"
                      rows={4}
                      placeholder="390, 490…"
                      value={preciosManual}
                      onChange={(e) => setPreciosManual(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="razon-manual">Razón común (opcional)</Label>
                  <Input
                    id="razon-manual"
                    placeholder="Ej. Promo por feriado / liquidación curada"
                    value={razonManual}
                    onChange={(e) => setRazonManual(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={accion !== null}
                  onClick={() => void guardarManual()}
                >
                  {accion === "save" ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                      Guardando…
                    </>
                  ) : (
                    "Guardar listado manual"
                  )}
                </Button>
              </div>

              <DialogFooter className="text-xs text-muted-foreground sm:justify-start">
                Cron: <code className="rounded bg-muted px-1">0 3 * * 1</code> UTC (lunes 00:00 Montevideo, UTC-3
                fijo). Variable <code className="rounded bg-muted px-1">WEEKLY_OFFERS_SKIP_WOO=1</code> evita tocar
                Woo en desarrollo.
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
}
