"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Fase = "arranque" | "salida" | "listo";

const MS_MINIMO_OVERLAY = 420;
const MS_SALIDA_OVERLAY = 360;
const MS_MAX_ESPERA = 12000;
const MS_BARRA_NAV = 320;

function BarraNavegacion() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-9998 h-[3px] overflow-hidden bg-primary/15"
      aria-hidden
    >
      <div className="global-preloader-nav-bar h-full w-1/3 rounded-full bg-primary shadow-sm" />
    </div>
  );
}

export function GlobalPreloader() {
  const pathname = usePathname();
  const [fase, setFase] = useState<Fase>("arranque");
  const [navActiva, setNavActiva] = useState(false);
  const rutaAnterior = useRef<string | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setFase("listo");
      return;
    }

    let cancelado = false;
    let idMinimo: number | undefined;
    let yaProgramadoSalida = false;
    const inicio = performance.now();

    const pasarASalida = () => {
      if (cancelado || yaProgramadoSalida) return;
      yaProgramadoSalida = true;
      const transcurrido = performance.now() - inicio;
      const restante = Math.max(0, MS_MINIMO_OVERLAY - transcurrido);
      idMinimo = window.setTimeout(() => {
        if (!cancelado) setFase("salida");
      }, restante);
    };

    if (document.readyState === "complete") {
      pasarASalida();
    } else {
      window.addEventListener("load", pasarASalida, { once: true });
    }

    const maxId = window.setTimeout(pasarASalida, MS_MAX_ESPERA);
    return () => {
      cancelado = true;
      if (idMinimo !== undefined) window.clearTimeout(idMinimo);
      window.clearTimeout(maxId);
      window.removeEventListener("load", pasarASalida);
    };
  }, []);

  useEffect(() => {
    if (fase !== "salida") return;
    const id = window.setTimeout(() => setFase("listo"), MS_SALIDA_OVERLAY);
    return () => window.clearTimeout(id);
  }, [fase]);

  useEffect(() => {
    if (fase === "arranque") return;
    const prev = rutaAnterior.current;
    rutaAnterior.current = pathname;
    if (prev === null) return;
    if (prev === pathname) return;
    setNavActiva(true);
    const id = window.setTimeout(() => setNavActiva(false), MS_BARRA_NAV);
    return () => window.clearTimeout(id);
  }, [pathname, fase]);

  if (fase === "listo") {
    return navActiva ? <BarraNavegacion /> : null;
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-9999 flex flex-col items-center justify-center gap-6",
          "bg-background/92 backdrop-blur-[10px] supports-backdrop-filter:bg-background/86",
          "transition-opacity ease-out motion-reduce:transition-none",
          fase === "salida" ? "pointer-events-none opacity-0" : "opacity-100",
        )}
        style={
          fase === "salida"
            ? { transitionDuration: `${MS_SALIDA_OVERLAY}ms` }
            : { transitionDuration: "280ms" }
        }
        role="status"
        aria-live="polite"
        aria-busy={fase === "arranque"}
      >
        <div className="flex flex-col items-center gap-3 px-6 text-center contain-[layout]">
          <p className="text-lg font-semibold tracking-tight text-foreground">Casa Miguel</p>
          <p className="text-xs font-semibold tracking-[0.28em] text-muted-foreground">CARGANDO</p>
        </div>
        <div
          className={cn(
            "size-10 rounded-full border-2 border-muted border-t-primary",
            "motion-safe:animate-spin motion-reduce:animate-none motion-reduce:border-primary/50",
          )}
          aria-hidden
        />
        <span className="sr-only">Cargando aplicación</span>
      </div>

      {navActiva ? <BarraNavegacion /> : null}
    </>
  );
}
