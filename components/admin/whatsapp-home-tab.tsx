"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Inbox,
  LayoutTemplate,
  Loader2,
  Megaphone,
  MessageSquare,
  Phone,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  mensajesSalientesPorDia: Array<{ dia: string; total: number }>;
  broadcastsPorEstado: Record<string, number>;
  templatesMetaPreview: Array<{
    name: string;
    language: string;
    status: string;
    category: string;
  }>;
  notificacionesTriggerRecientes: Array<{
    received_at: string;
    body: string;
    to_phone: string;
  }>;
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

const COL_ESTADO_PIE = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#94a3b8"];

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

function badgeMetaTemplateStatus(status: string): "default" | "success" | "warning" | "destructive" {
  const u = status.toUpperCase();
  if (u === "APPROVED") return "success";
  if (u === "PENDING") return "warning";
  if (u === "REJECTED" || u === "DISABLED") return "destructive";
  return "default";
}

function cortarDia(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${m}/${d}`;
}

export function WhatsappHomeTab() {
  const pathname = usePathname();
  const base = pathname || "/herramientas/whatsapp-marketing";
  const tabHref = useCallback((tab: string) => (tab === "inicio" ? base : `${base}?tab=${tab}`), [base]);

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/whatsapp/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as DashboardPayload;
      setData({
        ...json,
        mensajesSalientesPorDia: json.mensajesSalientesPorDia ?? [],
        broadcastsPorEstado: json.broadcastsPorEstado ?? {},
        templatesMetaPreview: json.templatesMetaPreview ?? [],
        notificacionesTriggerRecientes: json.notificacionesTriggerRecientes ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const pieBroadcastData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.broadcastsPorEstado).map(([name, value]) => ({
      name: etiquetaEstado(name),
      value,
    }));
  }, [data]);

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

  const chartSalientes = data.mensajesSalientesPorDia.map((r) => ({
    ...r,
    label: cortarDia(r.dia),
  }));

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" aria-hidden />
            Estado de la cuenta
          </CardTitle>
          <CardDescription>Número conectado y señales de Meta (Cloud API).</CardDescription>
        </CardHeader>
        <CardContent>
          {!cuenta.ok ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">{cuenta.error}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 shadow-sm">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="size-3.5 shrink-0" aria-hidden />
                  Número
                </p>
                <p className="font-medium">{cuenta.display_phone_number?.trim() || "—"}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 shadow-sm">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
                  Nombre verificado
                </p>
                <p className="truncate font-medium">{cuenta.verified_name ?? "—"}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 shadow-sm">
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
              <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 shadow-sm">
                <p className="text-xs text-muted-foreground">Nivel de mensajes (tier)</p>
                <p className="font-mono text-sm font-medium">{tier}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
        <span className="w-full text-xs font-medium text-muted-foreground sm:w-auto sm:self-center sm:pr-2">
          Ir a
        </span>
        <Button variant="secondary" size="sm" asChild>
          <Link href={tabHref("templates")}>
            <LayoutTemplate className="size-4" aria-hidden />
            Templates Meta
          </Link>
        </Button>
        <Button variant="secondary" size="sm" asChild>
          <Link href={tabHref("broadcast")}>
            <Megaphone className="size-4" aria-hidden />
            Broadcast
          </Link>
        </Button>
        <Button variant="secondary" size="sm" asChild>
          <Link href={tabHref("bandeja")}>
            <Inbox className="size-4" aria-hidden />
            Bandeja
          </Link>
        </Button>
        <Button variant="secondary" size="sm" asChild>
          <Link href={tabHref("notif-woo")}>
            <ShoppingBag className="size-4" aria-hidden />
            Notif. Woo
          </Link>
        </Button>
        <Button variant="secondary" size="sm" asChild>
          <Link href={tabHref("contactos")}>
            <Users className="size-4" aria-hidden />
            Contactos
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="size-4 text-primary" aria-hidden />
              Mensajes salientes por día
            </CardTitle>
            <CardDescription>Últimos {periodoDias} días (UTC), dirección saliente.</CardDescription>
          </CardHeader>
          <CardContent className="h-64 w-full min-h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartSalientes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [v, "Mensajes"]}
                  labelFormatter={(_, p) => {
                    const row = p?.[0]?.payload as { dia?: string } | undefined;
                    return row?.dia ?? "";
                  }}
                />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Salientes" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-primary" aria-hidden />
              Broadcasts del período (estado)
            </CardTitle>
            <CardDescription>Distribución por estado en los últimos {periodoDias} días.</CardDescription>
          </CardHeader>
          <CardContent className="h-64 w-full min-h-[240px]">
            {pieBroadcastData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin broadcasts en el período.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieBroadcastData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={88}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {pieBroadcastData.map((_, i) => (
                      <Cell key={pieBroadcastData[i]?.name ?? i} fill={COL_ESTADO_PIE[i % COL_ESTADO_PIE.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/80 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4" aria-hidden />
              Coste estimado API (broadcasts)
            </CardTitle>
            <CardDescription>
              Suma de costes estimados al crear cada broadcast en los últimos {periodoDias} días, por categoría
              de template. Tarifas configurables en Configuración.
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
                    className="rounded-lg border border-border/60 bg-card px-3 py-2 text-sm shadow-sm"
                  >
                    <p className="text-muted-foreground">{ETIQUETA_CAT[k]}</p>
                    <p className="text-lg font-semibold tabular-nums">USD {row.costeUsd.toFixed(4)}</p>
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
              Mensajes fuera de broadcast no desglosan categoría aquí; salientes del período:{" "}
              {data.mensajesSalientesPeriodo}.
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutTemplate className="size-4" aria-hidden />
              Templates (vista Meta)
            </CardTitle>
            <CardDescription>Muestra parcial desde Graph API; ir a la pestaña para gestionar.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.templatesMetaPreview.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No se listaron plantillas (revisá token/WABA o abrí la pestaña Templates).
              </p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
                {data.templatesMetaPreview.map((t) => (
                  <li
                    key={`${t.name}-${t.language}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5"
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t.language}</span>
                      <Badge variante={badgeMetaTemplateStatus(t.status)}>{t.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Button className="mt-3" variant="outline" size="sm" asChild>
              <Link href={tabHref("templates")}>Abrir Templates Meta</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="size-4" aria-hidden />
              Últimas notificaciones Woo (log)
            </CardTitle>
            <CardDescription>Mensajes salientes cuyo cuerpo empieza con <code>[trigger</code>.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.notificacionesTriggerRecientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay envíos con prefijo de trigger.</p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
                {data.notificacionesTriggerRecientes.map((n) => (
                  <li
                    key={`${n.received_at}-${n.to_phone}-${n.body.slice(0, 24)}`}
                    className="rounded-md border border-border/50 bg-muted/20 px-2 py-1.5"
                  >
                    <p className="text-xs text-muted-foreground">
                      {new Date(n.received_at).toLocaleString("es-UY")} → {n.to_phone}
                    </p>
                    <p className="line-clamp-2 font-medium">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
            <Button className="mt-3" variant="outline" size="sm" asChild>
              <Link href={tabHref("notif-woo")}>Abrir Notificaciones Woo</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Últimos broadcasts</CardTitle>
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
          <Button className="mt-3" variant="outline" size="sm" asChild>
            <Link href={tabHref("broadcast")}>Ir a Broadcast</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
