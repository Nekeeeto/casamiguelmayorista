"use client";

import dynamic from "next/dynamic";

const HerramientasIaInner = dynamic(() => import("./herramientas-ia-inner"), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground dark:bg-muted/15">
      Cargando herramientas IA…
    </div>
  ),
});

export default function HerramientasIaLoader() {
  return <HerramientasIaInner />;
}
