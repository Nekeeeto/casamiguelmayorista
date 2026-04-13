"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PropsSync = {
  /** `flotante`: botón fijo abajo a la derecha. `integrado`: bloque al pie del contenido. */
  variante?: "flotante" | "integrado";
};

/**
 * Sincroniza categorías y productos Woo → Supabase en una sola llamada (POST /api/sync).
 */
export function InventarioSyncManualFlotante({ variante = "flotante" }: PropsSync) {
  const router = useRouter();
  const [sincronizando, setSincronizando] = useState(false);
  const [feedback, setFeedback] = useState<{ texto: string; ok: boolean } | null>(null);

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    setFeedback(null);
    try {
      const respuesta = await fetch("/api/sync", { method: "POST" });
      const cuerpo = (await respuesta.json()) as {
        ok?: boolean;
        error?: string;
        synced_categories?: number;
        synced_products?: number;
      };
      if (!respuesta.ok || !cuerpo.ok) {
        throw new Error(cuerpo.error ?? "No se pudo sincronizar.");
      }
      setFeedback({
        ok: true,
        texto: `Listo: ${cuerpo.synced_categories ?? 0} categorías · ${cuerpo.synced_products ?? 0} productos`,
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        ok: false,
        texto: error instanceof Error ? error.message : "Error al sincronizar.",
      });
    } finally {
      setSincronizando(false);
    }
  }, [router]);

  const contenidoFeedback = feedback ? (
    <p
      className={cn(
        "rounded-lg border px-3 py-2 text-xs shadow-sm",
        variante === "flotante" && "shadow-md",
        feedback.ok
          ? "border-border bg-card text-foreground"
          : "border-destructive/50 bg-destructive/10 text-destructive",
      )}
      role="status"
      aria-live="polite"
    >
      {feedback.texto}
    </p>
  ) : null;

  const boton = (
    <Button
      type="button"
      size={variante === "integrado" ? "default" : "lg"}
      className={cn(
        "gap-2",
        variante === "flotante"
          ? "pointer-events-auto rounded-full px-5 shadow-lg"
          : "w-full sm:w-auto",
      )}
      disabled={sincronizando}
      aria-busy={sincronizando}
      onClick={() => void sincronizar()}
    >
      <RefreshCw className={cn("size-4 shrink-0", sincronizando && "animate-spin")} aria-hidden />
      {sincronizando ? "Sincronizando…" : "Sincronizar Woo → Supabase"}
    </Button>
  );

  if (variante === "integrado") {
    return (
      <div className="rounded-lg border border-border bg-muted/15 p-4">
        <p className="mb-3 text-xs text-muted-foreground">
          Una sola llamada <span className="font-mono text-foreground">POST /api/sync</span>: categorías y productos
          desde WooCommerce hacia la base local.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {contenidoFeedback}
          {boton}
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-50 flex max-w-[min(100vw-1.5rem,280px)] flex-col items-end gap-2 pl-4"
      style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      {contenidoFeedback ? (
        <div className="pointer-events-auto">{contenidoFeedback}</div>
      ) : null}
      <div className="pointer-events-auto">{boton}</div>
    </div>
  );
}
