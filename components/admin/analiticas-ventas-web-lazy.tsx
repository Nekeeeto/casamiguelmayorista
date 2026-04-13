"use client";

import dynamic from "next/dynamic";

import type { ResultadoAnaliticasVentasWeb } from "@/lib/analiticas-ventas-web";

const Dashboard = dynamic(
  () =>
    import("@/components/admin/analiticas-ventas-web-dashboard").then((mod) => ({
      default: mod.AnaliticasVentasWebDashboard,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        Cargando gráficas…
      </div>
    ),
  },
);

export function AnaliticasVentasWebLazy(props: {
  datos: ResultadoAnaliticasVentasWeb;
  categoriaFiltroEtiqueta?: string | null;
}) {
  return <Dashboard {...props} />;
}
