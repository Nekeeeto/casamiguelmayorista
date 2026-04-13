"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { etiquetaEstadoPedidoAdmin } from "@/lib/pedidos-admin-listado";
import { clasesEstadoPedidoAdmin } from "@/lib/pedidos-admin-estado-estilos";
import {
  detectarPresetPedidos,
  formatoDdMmYyyyDesdeYmd,
  formatoYmdDesdeDdMmYyyy,
  PRESETS_RANGO_PEDIDOS,
  rangoPresetPedidos,
} from "@/lib/rango-fechas-pedidos";
import { cn } from "@/lib/utils";

function armarQuery(
  base: {
    desde: string;
    hasta: string;
    estado: string;
    pagina: number;
    porPagina: number;
  },
  patch: Partial<{ desde: string; hasta: string; estado: string; pagina: number; porPagina: number }>,
) {
  const desde = patch.desde ?? base.desde;
  const hasta = patch.hasta ?? base.hasta;
  const estado = patch.estado !== undefined ? patch.estado : base.estado;
  const pagina = patch.pagina ?? base.pagina;
  const porPagina = patch.porPagina ?? base.porPagina;
  const p = new URLSearchParams();
  p.set("desde", desde);
  p.set("hasta", hasta);
  if (estado.trim()) p.set("estado", estado.trim());
  p.set("pagina", String(Math.max(1, pagina)));
  p.set("porPagina", String(porPagina));
  return `/admin/pedidos?${p.toString()}`;
}

/** Chips visibles: 3 proceso, 3 espera, completado al final (sin pendiente/cancelado/reembolsado/fallido). */
const SLUGS_ESTADO_FILTRO_PRINCIPAL = [
  "proceso-mvd",
  "proceso-interior",
  "proceso-pickup",
  "espera-mvd",
  "espera-interior",
  "espera-pickup",
  "completed",
] as const;

const SLUGS_ESTADO_FILTRO_MAS = ["pending", "cancelled", "refunded", "failed"] as const;

export type PedidosPieQueryProps = {
  desde: string;
  hasta: string;
  estado: string;
  pagina: number;
  porPagina: number;
};

export type PedidosFiltrosPaginacionProps = PedidosPieQueryProps & {
  conteosPorEstado: Record<string, number>;
};

export type PedidosPorPaginaYResumenProps = PedidosPieQueryProps & {
  total: number;
};

/** “Por página” y texto de totales — debajo de la tabla. */
export function PedidosPorPaginaYResumen({
  desde,
  hasta,
  estado,
  pagina,
  porPagina,
  total,
}: PedidosPorPaginaYResumenProps) {
  const base = { desde, hasta, estado, pagina, porPagina };
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Por página:</span>
        {[20, 50, 100].map((n) => (
          <Link
            key={n}
            href={armarQuery(base, { porPagina: n, pagina: 1 })}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
              porPagina === n
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-background hover:bg-muted/50",
            )}
            scroll={false}
          >
            {n}
          </Link>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{total}</span> pedido
        {total === 1 ? "" : "s"} en esta vista
        {estado ? (
          <>
            {" "}
            · filtro: <span className="text-foreground">{etiquetaEstadoPedidoAdmin(estado)}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

export type PedidosNavegacionPaginasProps = PedidosPieQueryProps & {
  totalPaginas: number;
};

/** Anterior / Siguiente y “Página x de y” — debajo de la tabla de pedidos. */
export function PedidosNavegacionPaginas({
  desde,
  hasta,
  estado,
  pagina,
  porPagina,
  totalPaginas,
}: PedidosNavegacionPaginasProps) {
  const base = { desde, hasta, estado, pagina, porPagina };
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Página <span className="font-medium text-foreground tabular-nums">{pagina}</span> de{" "}
        <span className="font-medium text-foreground tabular-nums">{totalPaginas}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {pagina > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={armarQuery(base, { pagina: pagina - 1 })} scroll={false}>
              Anterior
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Anterior
          </Button>
        )}
        {pagina < totalPaginas ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={armarQuery(base, { pagina: pagina + 1 })} scroll={false}>
              Siguiente
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Siguiente
          </Button>
        )}
      </div>
    </div>
  );
}

export function PedidosFiltrosPaginacion(props: PedidosFiltrosPaginacionProps) {
  const router = useRouter();
  const { desde, hasta, estado, pagina, porPagina, conteosPorEstado } = props;
  const base = { desde, hasta, estado, pagina, porPagina };
  const totalRango = conteosPorEstado.total ?? 0;

  const [desdeTexto, setDesdeTexto] = useState(() => formatoDdMmYyyyDesdeYmd(desde));
  const [hastaTexto, setHastaTexto] = useState(() => formatoDdMmYyyyDesdeYmd(hasta));
  const [personalizadoAbierto, setPersonalizadoAbierto] = useState(
    () => detectarPresetPedidos(desde, hasta) === null,
  );

  useEffect(() => {
    setDesdeTexto(formatoDdMmYyyyDesdeYmd(desde));
    setHastaTexto(formatoDdMmYyyyDesdeYmd(hasta));
  }, [desde, hasta]);

  useEffect(() => {
    setPersonalizadoAbierto(detectarPresetPedidos(desde, hasta) === null);
  }, [desde, hasta]);

  const presetActivo = detectarPresetPedidos(desde, hasta);
  const rangoPersonalizadoActivo = presetActivo === null;

  const aplicarRangoManual = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const y1 = formatoYmdDesdeDdMmYyyy(desdeTexto);
      const y2 = formatoYmdDesdeDdMmYyyy(hastaTexto);
      if (!y1 || !y2) {
        toast.error("Revisá las fechas: usá día-mes-año con guiones (ej. 12-04-2026).");
        return;
      }
      router.push(
        armarQuery({ desde, hasta, estado, pagina, porPagina }, { desde: y1, hasta: y2, pagina: 1 }),
      );
      setPersonalizadoAbierto(false);
    },
    [desde, hasta, estado, pagina, porPagina, desdeTexto, hastaTexto, router],
  );

  const chipPeriodoClass = (activo: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      activo
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  const chipEstadoFiltroClass = (activo: boolean, slug: string) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      clasesEstadoPedidoAdmin(slug),
      activo ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-95 hover:opacity-100",
    );

  const [masEstadosAbierto, setMasEstadosAbierto] = useState(false);
  const filtroEnMasEstados = (SLUGS_ESTADO_FILTRO_MAS as readonly string[]).includes(estado);

  return (
    <div className="mb-6 space-y-4">
      <div
        className="space-y-3 rounded-lg border border-border bg-muted/15 p-4"
        data-pedidos-filtros="v2-texto-y-presets"
      >
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Período rápido</p>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS_RANGO_PEDIDOS.map(({ id, label }) => {
              const r = rangoPresetPedidos(id);
              const activo = presetActivo === id;
              return (
                <Link
                  key={id}
                  href={armarQuery(base, { desde: r.desde, hasta: r.hasta, pagina: 1 })}
                  className={chipPeriodoClass(activo)}
                  scroll={false}
                >
                  {label}
                </Link>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={personalizadoAbierto}
              aria-controls="pedidos-rango-personalizado"
              onClick={() => setPersonalizadoAbierto((v) => !v)}
              className={cn(
                "h-auto gap-2 rounded-full border-2 px-3.5 py-1.5 text-xs font-semibold shadow-md transition-all",
                personalizadoAbierto || rangoPersonalizadoActivo
                  ? "border-primary bg-primary/18 text-foreground shadow-primary/20 ring-2 ring-primary/40"
                  : "border-primary/55 bg-primary/12 text-foreground hover:bg-primary/20 hover:shadow-lg",
              )}
            >
              <CalendarDays className="size-4 shrink-0 opacity-95" aria-hidden />
              Personalizado
            </Button>
          </div>
        </div>

        {personalizadoAbierto ? (
          <div
            id="pedidos-rango-personalizado"
            className="border-t border-border/80 pt-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-reduce:animate-none"
          >
            <form
              onSubmit={aplicarRangoManual}
              className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
            >
              <div className="grid flex-1 gap-1.5 sm:min-w-[160px]">
                <Label htmlFor="pedidos-desde" className="text-xs text-muted-foreground">
                  Desde (día-mes-año)
                </Label>
                <Input
                  id="pedidos-desde"
                  name="desde"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="DD-MM-AAAA"
                  value={desdeTexto}
                  onChange={(e) => setDesdeTexto(e.target.value)}
                  className="bg-background"
                />
              </div>
              <div className="grid flex-1 gap-1.5 sm:min-w-[160px]">
                <Label htmlFor="pedidos-hasta" className="text-xs text-muted-foreground">
                  Hasta (día-mes-año)
                </Label>
                <Input
                  id="pedidos-hasta"
                  name="hasta"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="DD-MM-AAAA"
                  value={hastaTexto}
                  onChange={(e) => setHastaTexto(e.target.value)}
                  className="bg-background"
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto">
                Aplicar fechas
              </Button>
            </form>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado en el período</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={armarQuery(base, { estado: "", pagina: 1 })}
            className={chipPeriodoClass(!estado)}
            scroll={false}
          >
            Todos
            <span className="tabular-nums opacity-90">({totalRango})</span>
          </Link>
          {SLUGS_ESTADO_FILTRO_PRINCIPAL.filter((slug) => (conteosPorEstado[slug] ?? 0) > 0).map((slug) => {
            const n = conteosPorEstado[slug] ?? 0;
            const activo = estado === slug;
            return (
              <Link
                key={slug}
                href={armarQuery(base, { estado: slug, pagina: 1 })}
                className={chipEstadoFiltroClass(activo, slug)}
                scroll={false}
              >
                {etiquetaEstadoPedidoAdmin(slug)}
                <span className="tabular-nums opacity-90">({n})</span>
              </Link>
            );
          })}
          <Popover open={masEstadosAbierto} onOpenChange={setMasEstadosAbierto}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "h-auto gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                  filtroEnMasEstados ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
                )}
                aria-expanded={masEstadosAbierto}
                aria-haspopup="dialog"
              >
                Más estados
                <ChevronDown className="size-3.5 opacity-80" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(100vw-2rem,280px)] p-2 sm:w-72">
              <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Otros estados en el período</p>
              <div className="flex flex-col gap-1.5">
                {SLUGS_ESTADO_FILTRO_MAS.map((slug) => {
                  const n = conteosPorEstado[slug] ?? 0;
                  const activo = estado === slug;
                  return (
                    <Link
                      key={slug}
                      href={armarQuery(base, { estado: slug, pagina: 1 })}
                      scroll={false}
                      onClick={() => setMasEstadosAbierto(false)}
                      className={cn(
                        chipEstadoFiltroClass(activo, slug),
                        "w-full justify-between rounded-md px-3 py-2 text-left",
                      )}
                    >
                      <span>{etiquetaEstadoPedidoAdmin(slug)}</span>
                      <span className="tabular-nums opacity-90">({n})</span>
                    </Link>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
