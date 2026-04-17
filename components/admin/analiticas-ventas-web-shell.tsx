"use client";

import { useCallback, useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { AnaliticasVentasWebLazy } from "@/components/admin/analiticas-ventas-web-lazy";
import {
  AnaliticasVentasWebFiltrosEditor,
  type AnaliticasVentasWebFiltrosPayload,
} from "@/components/admin/analiticas-ventas-web-rango-form";
import { AnaliticasVentasWebMetaTecnica } from "@/components/admin/analiticas-ventas-web-meta-tecnica";
import { AdminPanelTecnicoDisclosure } from "@/components/admin/admin-panel-tecnico-disclosure";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CargaAnaliticasVentasWeb } from "@/lib/analiticas-ventas-web-data";
import type { ResultadoAnaliticasVentasWeb } from "@/lib/analiticas-ventas-web";
import { cn } from "@/lib/utils";

type CategoriaFila = { woo_term_id: number; nombre: string; id_padre: number };

type RespuestaApiVentasWeb =
  | {
      ok: true;
      datos: ResultadoAnaliticasVentasWeb;
      desde: string;
      hasta: string;
      categoriaFiltroEtiqueta: string | null;
    }
  | { ok: false; error: string };

type Props = {
  cargaInicial: CargaAnaliticasVentasWeb;
  desdeInicial: string;
  hastaInicial: string;
  acategoriaInicial: string;
  categorias: CategoriaFila[];
  etiquetaCategoriaInicial: string | null;
  estadosPedidoWooResumen: string;
};

function etiquetaRangoCorta(desde: string, hasta: string) {
  const fmt = new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const d0 = `${desde}T12:00:00.000Z`;
  const d1 = `${hasta}T12:00:00.000Z`;
  return `${fmt.format(new Date(d0))} — ${fmt.format(new Date(d1))}`;
}

export function AnaliticasVentasWebShell({
  cargaInicial,
  desdeInicial,
  hastaInicial,
  acategoriaInicial,
  categorias,
  etiquetaCategoriaInicial,
  estadosPedidoWooResumen,
}: Props) {
  const [carga, setCarga] = useState<CargaAnaliticasVentasWeb>(cargaInicial);
  const [desde, setDesde] = useState(desdeInicial);
  const [hasta, setHasta] = useState(hastaInicial);
  const [acategoria, setAcategoria] = useState(acategoriaInicial);
  const [etiquetaCat, setEtiquetaCat] = useState(etiquetaCategoriaInicial);
  const [aplicando, setAplicando] = useState(false);
  const [sheetAbierto, setSheetAbierto] = useState(false);

  useEffect(() => {
    setCarga(cargaInicial);
    setDesde(desdeInicial);
    setHasta(hastaInicial);
    setAcategoria(acategoriaInicial);
    setEtiquetaCat(etiquetaCategoriaInicial);
  }, [cargaInicial, desdeInicial, hastaInicial, acategoriaInicial, etiquetaCategoriaInicial]);

  const aplicarFiltros = useCallback(async (payload: AnaliticasVentasWebFiltrosPayload) => {
    setAplicando(true);
    try {
      const qs = new URLSearchParams();
      qs.set("desde", payload.desde);
      qs.set("hasta", payload.hasta);
      if (payload.acategoria.trim()) {
        qs.set("acategoria", payload.acategoria.trim());
      }
      const res = await fetch(`/api/admin/analiticas/ventas-web?${qs.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as RespuestaApiVentasWeb;
      if (!body.ok) {
        setCarga({ ok: false, error: body.error });
        return;
      }
      setCarga({ ok: true, datos: body.datos });
      setDesde(body.desde);
      setHasta(body.hasta);
      setAcategoria(payload.acategoria);
      setEtiquetaCat(body.categoriaFiltroEtiqueta ?? null);

      const u = new URL(window.location.href);
      u.searchParams.set("tab", "analiticas");
      u.searchParams.set("analitica", "ventas-web");
      u.searchParams.set("desde", body.desde);
      u.searchParams.set("hasta", body.hasta);
      if (payload.acategoria.trim()) {
        u.searchParams.set("acategoria", payload.acategoria.trim());
      } else {
        u.searchParams.delete("acategoria");
      }
      window.history.replaceState(window.history.state, "", u.toString());
      setSheetAbierto(false);
    } finally {
      setAplicando(false);
    }
  }, []);

  const resumenFiltros = [
    etiquetaRangoCorta(desde, hasta),
    etiquetaCat ? etiquetaCat : "Todas las categorías",
  ].join(" · ");

  return (
    <div className="space-y-6">
      <div className="relative space-y-6">
        {carga.ok === false ? (
          <div className="rounded-lg border border-destructive/50 bg-card p-6 text-sm text-destructive">
            {carga.error}
          </div>
        ) : null}

        {carga.ok ? (
          <>
            <div
              className={cn(
                "relative min-h-[200px] transition-opacity",
                aplicando ? "pointer-events-none opacity-50" : "opacity-100",
              )}
            >
              <AnaliticasVentasWebLazy datos={carga.datos} categoriaFiltroEtiqueta={etiquetaCat} />
              {aplicando ? (
                <div
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/75 backdrop-blur-[2px]"
                  role="status"
                  aria-live="polite"
                >
                  <div className="size-10 rounded-full border-2 border-muted border-t-primary motion-safe:animate-spin motion-reduce:border-primary/40" />
                  <p className="text-sm font-medium text-foreground">Cargando datos…</p>
                </div>
              ) : null}
            </div>

            <AdminPanelTecnicoDisclosure titulo="Herramientas técnicas (WooCommerce, API y totales del pedido)">
              <AnaliticasVentasWebMetaTecnica
                desde={desde}
                hasta={hasta}
                estadosPedidoWooResumen={estadosPedidoWooResumen}
                resumen={carga.datos.resumen}
                categoriaFiltroEtiqueta={etiquetaCat}
              />
            </AdminPanelTecnicoDisclosure>
          </>
        ) : null}
      </div>

      <Sheet open={sheetAbierto} onOpenChange={setSheetAbierto}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="fixed bottom-6 right-6 z-40 h-auto max-w-[min(100vw-3rem,22rem)] flex-col gap-1 rounded-2xl border border-border px-4 py-3 shadow-lg"
            aria-label="Abrir filtros de analíticas ventas web"
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
              Filtros
            </span>
            <span className="line-clamp-2 w-full text-left text-xs font-normal text-muted-foreground">
              {resumenFiltros}
            </span>
          </Button>
        </SheetTrigger>
        <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Filtros — Ventas web</SheetTitle>
            <SheetDescription>
              Rango UTC (como Woo), presets y categoría. Los cambios no recargan la página completa.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 px-6 pb-8">
            <AnaliticasVentasWebFiltrosEditor
              key={`${desde}-${hasta}-${acategoria}`}
              desdeInicial={desde}
              hastaInicial={hasta}
              acategoriaInicial={acategoria}
              categorias={categorias}
              alAplicar={aplicarFiltros}
              aplicando={aplicando}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
