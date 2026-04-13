function Pulse({ className }: { className?: string }) {
  return <div className={["animate-pulse rounded-md bg-muted/50", className].filter(Boolean).join(" ")} aria-hidden />;
}

function IconoCargandoPedidos() {
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center" aria-hidden>
      <svg
        className="absolute size-11 animate-spin text-primary motion-reduce:animate-none"
        style={{ animationDuration: "0.9s" }}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle className="text-muted-foreground/25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
        <path
          className="text-primary"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </span>
  );
}

export function PedidosAdminContenidoSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-3 rounded-lg border border-primary/35 bg-gradient-to-r from-primary/12 via-primary/6 to-transparent px-4 py-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <IconoCargandoPedidos />
          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight text-foreground">Cargando datos</p>
            <p className="text-xs text-muted-foreground motion-safe:animate-pulse">
              Actualizando la lista desde WooCommerce…
            </p>
          </div>
        </div>
        <div
          className="relative h-1.5 overflow-hidden rounded-full bg-muted/60 sm:max-w-[220px] sm:flex-1"
          aria-hidden
        >
          <div className="pedidos-carga-barra absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary/85 motion-reduce:animate-none" />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-muted/15 p-4">
        <div className="space-y-2">
          <Pulse className="h-3 w-28" />
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Pulse key={i} className="h-8 w-24 rounded-full" />
            ))}
            <Pulse className="h-8 w-36 rounded-full" />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Pulse className="h-3 w-40" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 11 }).map((_, i) => (
            <Pulse key={i} className="h-8 w-30" />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <div className="flex gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Pulse key={i} className="h-4 flex-1 max-w-24" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-4">
              <Pulse className="h-4 w-16" />
              <Pulse className="h-4 flex-1 max-w-48" />
              <Pulse className="h-4 w-28" />
              <Pulse className="h-4 w-24" />
              <Pulse className="h-6 w-28" />
              <Pulse className="h-8 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4 border-t border-border pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Pulse className="h-4 w-48" />
          </div>
          <Pulse className="h-4 w-40" />
        </div>
        <div className="flex justify-between gap-2">
          <Pulse className="h-4 w-36" />
          <div className="flex gap-2">
            <Pulse className="h-9 w-24" />
            <Pulse className="h-9 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
