"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Fase = "arranque" | "salida" | "listo";

const MS_MINIMO_OVERLAY = 420;
const MS_SALIDA_OVERLAY = 360;
const MS_MAX_ESPERA = 12000;
const MS_DEBOUNCE_OVERLAY_NAV = 200;
const MS_MAX_OVERLAY_NAV = 28000;

function BarraNavegacion() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-10001 h-[3px] overflow-hidden bg-primary/15"
      aria-hidden
    >
      <div className="global-preloader-nav-bar h-full w-1/3 rounded-full bg-primary shadow-sm" />
    </div>
  );
}

function esNavegacionInternaSiguiente(href: string): boolean {
  try {
    const next = new URL(href, window.location.origin);
    const cur = new URL(window.location.href);
    if (next.origin !== cur.origin) return false;
    const nextKey = `${next.pathname}${next.search}`;
    const curKey = `${cur.pathname}${cur.search}`;
    return nextKey !== curKey;
  } catch {
    return false;
  }
}

function GlobalPreloaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const claveRuta = `${pathname}${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`;

  const [fase, setFase] = useState<Fase>("arranque");
  const [navPendiente, setNavPendiente] = useState(false);
  const [navOverlay, setNavOverlay] = useState(false);
  const idDebounceRef = useRef<number | null>(null);
  const listoRef = useRef(false);

  useLayoutEffect(() => {
    listoRef.current = fase === "listo";
  }, [fase]);

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
    setNavPendiente(false);
    setNavOverlay(false);
    if (idDebounceRef.current !== null) {
      window.clearTimeout(idDebounceRef.current);
      idDebounceRef.current = null;
    }
  }, [claveRuta]);

  useEffect(() => {
    if (!navPendiente) {
      if (idDebounceRef.current !== null) {
        window.clearTimeout(idDebounceRef.current);
        idDebounceRef.current = null;
      }
      setNavOverlay(false);
      return;
    }
    idDebounceRef.current = window.setTimeout(() => {
      idDebounceRef.current = null;
      setNavOverlay(true);
    }, MS_DEBOUNCE_OVERLAY_NAV);
    return () => {
      if (idDebounceRef.current !== null) {
        window.clearTimeout(idDebounceRef.current);
        idDebounceRef.current = null;
      }
    };
  }, [navPendiente]);

  useEffect(() => {
    if (!navPendiente) return;
    const id = window.setTimeout(() => setNavPendiente(false), MS_MAX_OVERLAY_NAV);
    return () => window.clearTimeout(id);
  }, [navPendiente]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!listoRef.current) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (!esNavegacionInternaSiguiente(anchor.href)) return;
      setNavPendiente(true);
    };

    const onPop = () => {
      if (listoRef.current) setNavPendiente(true);
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  const overlayInicial = fase !== "listo";
  const overlayNav = fase === "listo" && navOverlay;
  const mostrarOverlay = overlayInicial || overlayNav;
  const salidaInicial = overlayInicial && fase === "salida";

  return mostrarOverlay ? (
    <div
      className={cn(
        "fixed inset-0 z-10000 flex flex-col items-center justify-center gap-6",
        "bg-background/92 backdrop-blur-[10px] supports-backdrop-filter:bg-background/86",
        "transition-opacity ease-out motion-reduce:transition-none",
        salidaInicial ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100",
      )}
      style={
        salidaInicial ? { transitionDuration: `${MS_SALIDA_OVERLAY}ms` } : { transitionDuration: "280ms" }
      }
      role="status"
      aria-live="polite"
      aria-busy={mostrarOverlay}
    >
      {overlayNav ? <BarraNavegacion /> : null}
      <div className="flex flex-col items-center gap-8 px-6 text-center contain-[layout]">
        <p className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Cargando</p>
        <Loader2
          className={cn(
            "global-preloader-icon-spin size-16 shrink-0 text-primary sm:size-20",
            "motion-reduce:opacity-75",
          )}
          strokeWidth={2.25}
          aria-hidden
        />
      </div>
      <span className="sr-only">Cargando</span>
    </div>
  ) : null;
}

export function GlobalPreloader() {
  return (
    <Suspense fallback={null}>
      <GlobalPreloaderInner />
    </Suspense>
  );
}
