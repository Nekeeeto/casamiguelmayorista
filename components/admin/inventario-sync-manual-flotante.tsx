"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sincroniza categorías y productos Woo → Supabase en una sola llamada (POST /api/sync).
 * Botón fijo visible mientras se navega el inventario.
 */
export function InventarioSyncManualFlotante() {
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

  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-50 flex max-w-[min(100vw-1.5rem,280px)] flex-col items-end gap-2 pl-4"
      style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      {feedback ? (
        <p
          className={cn(
            "pointer-events-auto rounded-lg border px-3 py-2 text-xs shadow-md",
            feedback.ok
              ? "border-border bg-card text-foreground"
              : "border-destructive/50 bg-destructive/10 text-destructive",
          )}
          role="status"
          aria-live="polite"
        >
          {feedback.texto}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="pointer-events-auto gap-2 rounded-full px-5 shadow-lg"
        disabled={sincronizando}
        aria-busy={sincronizando}
        onClick={() => void sincronizar()}
      >
        <RefreshCw
          className={cn("size-4 shrink-0", sincronizando && "animate-spin")}
          aria-hidden
        />
        {sincronizando ? "Sincronizando…" : "Sync manual"}
      </Button>
    </div>
  );
}
