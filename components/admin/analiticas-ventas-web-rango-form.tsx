"use client";

import { CalendarRange, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatoIsoFechaUtc,
  parseIsoFechaUtc,
  rangoDesdePreset,
  utcHoy,
  type PresetRangoAnaliticasId,
} from "@/lib/analiticas-rango-fechas-utc";
import { cn } from "@/lib/utils";

const PRESETS: { id: PresetRangoAnaliticasId; etiqueta: string }[] = [
  { id: "ultimos_7", etiqueta: "Últimos 7 días" },
  { id: "ultimos_30", etiqueta: "Últimos 30 días" },
  { id: "este_mes", etiqueta: "Este mes" },
  { id: "mes_anterior", etiqueta: "Mes anterior" },
  { id: "este_anio", etiqueta: "Este año" },
  { id: "periodo_maximo", etiqueta: "Periodo máximo" },
  { id: "ayer", etiqueta: "Ayer" },
];

function formatearRangoEtiqueta(range: DateRange | undefined, fallbackDesde: string, fallbackHasta: string) {
  const fmt = new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const from = range?.from ?? parseIsoFechaUtc(fallbackDesde);
  const to = range?.to ?? range?.from ?? parseIsoFechaUtc(fallbackHasta);
  return `${fmt.format(from)} — ${fmt.format(to)}`;
}

type CategoriaOpcion = { woo_term_id: number; nombre: string };

function useMesesVisiblesCalendario() {
  const [meses, setMeses] = useState(1);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const actualizar = () => setMeses(mq.matches ? 2 : 1);
    actualizar();
    mq.addEventListener("change", actualizar);
    return () => mq.removeEventListener("change", actualizar);
  }, []);
  return meses;
}

export type AnaliticasVentasWebFiltrosPayload = {
  desde: string;
  hasta: string;
  acategoria: string;
};

type Props = {
  desdeInicial: string;
  hastaInicial: string;
  acategoriaInicial: string;
  categorias: CategoriaOpcion[];
  alAplicar: (payload: AnaliticasVentasWebFiltrosPayload) => void | Promise<void>;
  aplicando?: boolean;
};

export function AnaliticasVentasWebFiltrosEditor({
  desdeInicial,
  hastaInicial,
  acategoriaInicial,
  categorias,
  alAplicar,
  aplicando = false,
}: Props) {
  const inicial = useMemo<DateRange>(
    () => ({
      from: parseIsoFechaUtc(desdeInicial),
      to: parseIsoFechaUtc(hastaInicial),
    }),
    [desdeInicial, hastaInicial],
  );

  const [rango, setRango] = useState<DateRange | undefined>(inicial);
  const [popoverAbierto, setPopoverAbierto] = useState(false);
  const [presetActivo, setPresetActivo] = useState<PresetRangoAnaliticasId | null>(null);
  const [acategoria, setAcategoria] = useState(acategoriaInicial);
  const mesesCalendario = useMesesVisiblesCalendario();

  useEffect(() => {
    setRango(inicial);
    setAcategoria(acategoriaInicial);
    setPresetActivo(null);
  }, [inicial, acategoriaInicial]);

  const textoRango = formatearRangoEtiqueta(rango, desdeInicial, hastaInicial);

  const desdeStr =
    rango?.from != null ? formatoIsoFechaUtc(rango.from) : desdeInicial;
  const hastaStr =
    rango?.to != null
      ? formatoIsoFechaUtc(rango.to)
      : rango?.from != null
        ? formatoIsoFechaUtc(rango.from)
        : hastaInicial;

  function aplicarPreset(id: PresetRangoAnaliticasId) {
    const { desde, hasta } = rangoDesdePreset(id);
    setRango({ from: desde, to: hasta });
    setPresetActivo(id);
  }

  async function enviar() {
    await alAplicar({
      desde: desdeStr,
      hasta: hastaStr,
      acategoria,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Rango de fechas (UTC, como Woo)</span>
            <Popover open={popoverAbierto} onOpenChange={setPopoverAbierto}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full max-w-md justify-start gap-2 text-left font-normal text-foreground"
                >
                  <CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{textoRango}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto max-w-[calc(100vw-1.5rem)] p-0" align="start">
                <div className="overflow-x-auto p-2">
                  <Calendar
                    mode="range"
                    defaultMonth={rango?.from ?? inicial.from}
                    selected={rango}
                    onSelect={(next) => {
                      setRango(next);
                      setPresetActivo(null);
                    }}
                    numberOfMonths={mesesCalendario}
                    disabled={{ after: utcHoy() }}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant={presetActivo === p.id ? "default" : "secondary"}
                className={cn(presetActivo === p.id && "shadow-sm")}
                onClick={() => aplicarPreset(p.id)}
              >
                {p.etiqueta}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-1.5 xl:w-72">
          <label htmlFor="analitica-acategoria-floating" className="text-xs text-muted-foreground">
            Categoría (incluye subcategorías)
          </label>
          <select
            id="analitica-acategoria-floating"
            value={acategoria}
            onChange={(e) => setAcategoria(e.target.value)}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.woo_term_id} value={String(c.woo_term_id)}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="button"
          className="h-11 w-full shrink-0 sm:w-auto"
          disabled={aplicando}
          onClick={() => void enviar()}
        >
          {aplicando ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
          Aplicar filtros
        </Button>
      </div>
    </div>
  );
}
