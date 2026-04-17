"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type DashboardPayload = {
  cuenta: {
    display_phone_number: string | null;
    verified_name: string | null;
    quality_rating: string | null;
    messaging_limit_tier: string | null;
    ok: boolean;
    error: string | null;
  };
  pricing: { marketing: number; utility: number; authentication: number };
  periodoDias: number;
  costePorCategoria: Record<string, { costeUsd: number; enviadosOk: number }>;
  costeTotalEstimadoBroadcastsUsd: number;
  contactosTotal: number;
  mensajesSalientesPeriodo: number;
  broadcastsRecientes: Array<{
    id: string;
    template_name: string;
    template_language: string;
    template_category: string | null;
    total: number;
    delivered: number;
    failed: number;
    skipped: number;
    status: string;
    created_at: string;
    coste_estimado_usd: number;
  }>;
};

const ETIQUETA_CAT: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utilidad",
  authentication: "Autenticación",
};

function etiquetaEstado(status: string): string {
  switch (status) {
    case "completado":
      return "Completado";
    case "en_curso":
      return "En curso";
    case "pendiente":
      return "Pendiente";
    case "cancelado":
      return "Cancelado";
    default:
      return status;
  }
}

function badgeVariantStatus(status: string): "default" | "success" | "warning" | "destructive" {
  if (status === "completado") return "success";
  if (status === "en_curso") return "warning";
  if (status === "cancelado") return "destructive";
  return "default";
}

export function WhatsappHomeTab() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/whatsapp/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setData((await res.json()) as DashboardPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando resumen…
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        {error ?? "No se pudo cargar el dashboard."}{" "}
        <button type="button" className="underline" onClick={() => void cargar()}>
          Reintentar
        </button>
      </p>
    );
  }

  const { cuenta, pricing, periodoDias, costePorCategoria, costeTotalEstimadoBroadcastsUsd } = data;
  const cats = ["marketing", "utility", "authentication"] as const;
  const calidad = cuenta.quality_rating?.toUpperCase() ?? "—";
  const tier = cuenta.messaging_limit_tier ?? "—";

  return (
    <div className="space-y-6">
      <Card className="border-border/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Estado de la cuenta</CardTitle>
          <CardDescription>Número conectado y señales de Meta (Cloud API).</CardDescription>
        </CardHeader>
        <CardContent>
          {!cuenta.ok ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">{cuenta.error}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Número</p>
                <p className="font-medium">{cuenta.display_phone_number?.trim() || "—"}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Nombre verificado</p>
                <p className="truncate font-medium">{cuenta.verified_name ?? "—"}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Calidad</p>
                <p className="font-medium">
                  {calidad !== "—" ? (
                    <Badge
                      variante={
                        calidad === "GREEN" ? "success" : calidad === "YELLOW" ? "warning" : "destructive"
                      }
                      className="font-normal"
                    >
                      {calidad}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Nivel de mensajes (tier)</p>
                <p className="font-mono text-sm font-medium">{tier}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/80 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4" aria-hidden />
              Coste estimado API (broadcasts)
            </CardTitle>
            <CardDescription>
              Suma de costes estimados al crear cada broadcast en los últimos {periodoDias} días, por
              categoría de template. Tarifas configurables en Configuración.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {cats.map((k) => {
                const row = costePorCategoria[k] ?? { costeUsd: 0, enviadosOk: 0 };
                const unit = pricing[k] ?? 0;
                return (
                  <div
                    key={k}
                    className="rounded-lg border border-border/60 bg-card px-3 py-2 text-sm"
                  >
                    <p className="text-muted-foreground">{ETIQUETA_CAT[k]}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      USD {row.costeUsd.toFixed(4)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ~{row.enviadosOk} enviados ok · tarifa USD {unit.toFixed(4)}/msg
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">Total estimado (broadcasts, período)</span>
              <span className="font-semibold tabular-nums">
                USD {costeTotalEstimadoBroadcastsUsd.toFixed(4)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Los mensajes fuera de broadcast (bandeja, triggers Woo) no desglosan categoría aquí; el
              contador de salientes del período es {data.mensajesSalientesPeriodo}.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resumen</CardTitle>
            <CardDescription>Últimos {periodoDias} días</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contactos</span>
              <span className="font-medium tabular-nums">{data.contactosTotal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mensajes salientes</span>
              <span className="font-medium tabular-nums">{data.mensajesSalientesPeriodo}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Accesos rápidos — últimos broadcasts</CardTitle>
          <CardDescription>Notificaciones masivas por template (mismo flujo que la pestaña Broadcast).</CardDescription>
        </CardHeader>
        <CardContent>
          {data.broadcastsRecientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay broadcasts.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">OK</TableHead>
                  <TableHead className="text-right">Fallidos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.broadcastsRecientes.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(b.created_at).toLocaleString("es-UY", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {b.template_name}
                      <span className="ml-1 text-xs text-muted-foreground">{b.template_category}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variante={badgeVariantStatus(b.status)}>{etiquetaEstado(b.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.delivered}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.failed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
