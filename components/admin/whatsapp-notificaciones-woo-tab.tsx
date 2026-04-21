"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Beaker,
  Clock,
  Copy,
  FileCheck,
  Loader2,
  PackageOpen,
  RefreshCw,
  ShoppingCart,
  Star,
  Truck,
  XCircle,
  BadgeCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  CAMPOS_CARRITO_ABANDONADO,
  CAMPOS_REVIEW_WEBHOOK,
  TRIGGER_KEYS_PEDIDO,
  type TriggerKey,
  type TriggerKeyPedido,
} from "@/lib/whatsapp-woo-triggers";
import { normalizarSlugEstadoPedidoWoo, type OpcionEstadoPedidoWoo } from "@/lib/woo-order-statuses-catalog";

type Trigger = {
  trigger_key: TriggerKey;
  enabled: boolean;
  template_name: string | null;
  template_language: string;
  variable_mapping: Record<string, string>;
  template_header_media_url?: string | null;
  woo_status_slugs?: string[] | null;
  updated_at: string;
};

type TemplateLista = {
  name: string;
  language: string;
  placeholders: { totalVariables: number; headerFormat?: string | null };
};

function plantillaUsaCabeceraMultimedia(t: TemplateLista | undefined): boolean {
  const f = t?.placeholders?.headerFormat;
  return f === "IMAGE" || f === "VIDEO" || f === "DOCUMENT";
}

const GRILLA_NOTIFICACIONES: {
  key: TriggerKey;
  titulo: string;
  descripcion: string;
  icon: LucideIcon;
}[] = [
  {
    key: "order_delivered",
    titulo: "Pedido completado",
    descripcion: "Cuando el pedido pasa a completed.",
    icon: BadgeCheck,
  },
  {
    key: "order_shipped",
    titulo: "Pedido enviado",
    descripcion: "Estados shipped / enviado / envío (excluye slug enviado-dac y para-retirar).",
    icon: Truck,
  },
  {
    key: "order_pickup_ready",
    titulo: "Pedido para retirar",
    descripcion: "Slug Woo que contenga para-retirar (retiro en local).",
    icon: PackageOpen,
  },
  {
    key: "order_failed",
    titulo: "Pedido fallido",
    descripcion: "Cuando el pedido pasa a failed.",
    icon: XCircle,
  },
  {
    key: "order_cancelled",
    titulo: "Pedido cancelado",
    descripcion: "Cuando el pedido pasa a cancelled.",
    icon: Ban,
  },
  {
    key: "order_on_hold",
    titulo: "Pedido en espera",
    descripcion: "Cuando el pedido pasa a on-hold.",
    icon: Clock,
  },
];

const INTEGRACIONES_ESPECIALES: {
  key: TriggerKey;
  titulo: string;
  descripcion: string;
  icon: LucideIcon;
}[] = [
  {
    key: "wiser_review_request",
    titulo: "Solicitar reseñas (Wiser)",
    descripcion:
      "Webhook POST dedicado (URL en Wiser) o, alternativa, estado Woo cuyo slug contenga «wiser» vía webhook de pedidos.",
    icon: Star,
  },
  {
    key: "dac_shipping_receipt",
    titulo: "Comprobante de envío DAC",
    descripcion: "Slug enviado-dac (u otro que contenga enviado-dac) vía webhook de pedidos Woo.",
    icon: FileCheck,
  },
  {
    key: "cart_abandoned",
    titulo: "Carrito abandonado",
    descripcion: "Webhook FunnelKit / JSON contra la ruta dedicada (modal con URL y mapeo).",
    icon: ShoppingCart,
  },
];

function crearTestOrderIdsVacios(): Record<TriggerKeyPedido, string> {
  return TRIGGER_KEYS_PEDIDO.reduce(
    (acc, k) => {
      acc[k] = "";
      return acc;
    },
    {} as Record<TriggerKeyPedido, string>,
  );
}

const CAMPOS_PEDIDO = [
  { key: "id", label: "ID del pedido" },
  { key: "number", label: "Número de pedido" },
  { key: "billing.first_name", label: "Nombre cliente" },
  { key: "billing.last_name", label: "Apellido cliente" },
  { key: "billing.phone", label: "Teléfono cliente" },
  { key: "billing.city", label: "Ciudad" },
  { key: "shipping.city", label: "Ciudad de envío" },
  { key: "shipping.address_1", label: "Dirección de envío" },
  { key: "status", label: "Estado" },
  { key: "total", label: "Total" },
  { key: "currency", label: "Moneda" },
  { key: "tracking_number", label: "Código de seguimiento (meta)" },
  { key: "link_seguimiento", label: "Link de seguimiento (meta)" },
];

const RUTA_WEBHOOK_CARRITO = "/api/webhooks/funnelkit-carrito-abandonado";
const RUTA_WEBHOOK_WISER = "/api/webhooks/wiser-review-request";

function slugsOrdenadosIguales(a: string[], b: string[]): boolean {
  const na = [...a].map((s) => normalizarSlugEstadoPedidoWoo(s)).sort();
  const nb = [...b].map((s) => normalizarSlugEstadoPedidoWoo(s)).sort();
  if (na.length !== nb.length) return false;
  return na.every((v, i) => v === nb[i]);
}

export function WhatsappNotificacionesWooTab() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [templates, setTemplates] = useState<TemplateLista[]>([]);
  const [estadosWoo, setEstadosWoo] = useState<OpcionEstadoPedidoWoo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoKey, setGuardandoKey] = useState<TriggerKey | null>(null);
  const [modalCarritoAbierto, setModalCarritoAbierto] = useState(false);
  const [modalWiserAbierto, setModalWiserAbierto] = useState(false);
  const [testOrderIds, setTestOrderIds] = useState<Record<TriggerKeyPedido, string>>(() => crearTestOrderIdsVacios());

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [resT, resTpl] = await Promise.all([
        fetch("/api/admin/whatsapp/triggers", { cache: "no-store" }),
        fetch("/api/admin/whatsapp/templates?soloAprobados=true", { cache: "no-store" }),
      ]);
      if (!resT.ok) throw new Error(await resT.text());
      const t = (await resT.json()) as { triggers: Trigger[] };
      const tpl = resTpl.ok ? ((await resTpl.json()) as { templates: TemplateLista[] }) : { templates: [] };
      setTriggers(t.triggers);
      setTemplates(tpl.templates);
      try {
        const resSt = await fetch("/api/admin/woo/order-statuses", { cache: "no-store" });
        if (resSt.ok) {
          const st = (await resSt.json()) as { statuses?: OpcionEstadoPedidoWoo[] };
          setEstadosWoo(st.statuses ?? []);
        }
      } catch {
        setEstadosWoo([]);
      }
    } catch (error) {
      toast.error("No se pudieron cargar los triggers.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cartTrigger = useMemo(() => triggers.find((x) => x.trigger_key === "cart_abandoned"), [triggers]);
  const wiserTrigger = useMemo(() => triggers.find((x) => x.trigger_key === "wiser_review_request"), [triggers]);

  const actualizarTrigger = useCallback(
    async (triggerKey: TriggerKey, patch: Partial<Trigger>) => {
      setGuardandoKey(triggerKey);
      try {
        const res = await fetch("/api/admin/whatsapp/triggers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger_key: triggerKey, ...patch }),
        });
        if (!res.ok) throw new Error(await res.text());
        await cargar();
      } catch (error) {
        toast.error("No se pudo guardar.", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setGuardandoKey(null);
      }
    },
    [cargar],
  );

  const probarPedido = useCallback(async (triggerKey: TriggerKeyPedido) => {
    const orderIdRaw = testOrderIds[triggerKey];
    const orderId = Number(orderIdRaw);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      toast.error("Ingresá un orderId válido.");
      return;
    }
    try {
      const res = await fetch("/api/admin/whatsapp/triggers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerKey, orderId }),
      });
      const data = (await res.json()) as { ok?: boolean; motivo?: string; telefono?: string };
      if (data.ok) {
        toast.success(`Enviado a ${data.telefono}.`);
      } else {
        toast.error(`No se envió: ${data.motivo ?? "desconocido"}`);
      }
    } catch (error) {
      toast.error("Error probando trigger.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }, [testOrderIds]);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Configurá notificaciones automáticas desde WooCommerce. Requiere un webhook activo en Woo apuntando a{" "}
          <code className="rounded bg-muted px-1">/api/webhooks/woocommerce-pedidos</code>. Reseñas (Wiser) pueden usar
          POST dedicado a <code className="rounded bg-muted px-1">{RUTA_WEBHOOK_WISER}</code>. Carrito abandonado:{" "}
          <code className="rounded bg-muted px-1">{RUTA_WEBHOOK_CARRITO}</code>. El trigger{" "}
          <code className="rounded bg-muted px-1">order_confirmed</code> (processing) sigue en base y webhook; si necesitás
          plantilla para ese estado, editá la fila en Supabase o pedí que agreguemos tarjeta en esta grilla.
        </p>
        <Button variant="outline" size="sm" onClick={() => void cargar()}>
          <RefreshCw className="size-4" /> Refrescar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {GRILLA_NOTIFICACIONES.map((cfg) => {
          const t = triggers.find((x) => x.trigger_key === cfg.key);
          if (!t) {
            return (
              <Card key={cfg.key} className="border-dashed border-amber-500/35">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-amber-600 dark:text-amber-400">
                      <cfg.icon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="text-base leading-snug">{cfg.titulo}</CardTitle>
                      <CardDescription>{cfg.descripcion}</CardDescription>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Falta fila <code className="rounded bg-muted px-1">{cfg.key}</code>. En Supabase ejecutá{" "}
                        <code className="rounded bg-muted px-1">schema_phase10_whatsapp_triggers_expand.sql</code> (PASO_1
                        y luego PASO_2).
                      </p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          }

          const templateSeleccionada = templates.find(
            (tpl) => tpl.name === t.template_name && tpl.language === t.template_language,
          );
          const totalVars = templateSeleccionada?.placeholders.totalVariables ?? 0;
          const keyPedido = cfg.key as TriggerKeyPedido;
          return (
            <TriggerCardPedido
              key={cfg.key}
              icon={cfg.icon}
              trigger={t as Trigger & { trigger_key: TriggerKeyPedido }}
              meta={{ titulo: cfg.titulo, descripcion: cfg.descripcion }}
              opcionesEstadosWoo={estadosWoo}
              templates={templates}
              templateSeleccionada={templateSeleccionada}
              totalVars={totalVars}
              guardando={guardandoKey === t.trigger_key}
              onActualizar={(patch) => actualizarTrigger(t.trigger_key, patch)}
              testOrderId={testOrderIds[keyPedido]}
              onTestOrderIdChange={(value) => setTestOrderIds((prev) => ({ ...prev, [keyPedido]: value }))}
              onProbar={() => void probarPedido(keyPedido)}
            />
          );
        })}
      </div>

      <div className="space-y-3 rounded-xl border-2 border-primary/20 bg-muted/25 p-4 dark:bg-muted/15">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Integraciones especiales</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Webhooks propios o flujos distintos del cambio de estado estándar. Configuración y disparo en cada bloque.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {INTEGRACIONES_ESPECIALES.map((cfg) => {
            if (cfg.key === "cart_abandoned") {
              return (
                <Card key={cfg.key} className="flex flex-col border-dashed border-primary/30">
                  <CardHeader className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                        <cfg.icon className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="text-base leading-snug">{cfg.titulo}</CardTitle>
                        <CardDescription className="mt-1">{cfg.descripcion}</CardDescription>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => setModalCarritoAbierto(true)}
                    >
                      Abrir configuración
                    </Button>
                  </CardHeader>
                </Card>
              );
            }

            const t = triggers.find((x) => x.trigger_key === cfg.key);
            if (!t) {
              return (
                <Card key={cfg.key} className="border-dashed border-amber-500/35">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-amber-600 dark:text-amber-400">
                        <cfg.icon className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="text-base leading-snug">{cfg.titulo}</CardTitle>
                        <CardDescription>{cfg.descripcion}</CardDescription>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Falta fila <code className="rounded bg-muted px-1">{cfg.key}</code> en Supabase.
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              );
            }

            const keyPedido = cfg.key as TriggerKeyPedido;
            const templateSeleccionada = templates.find(
              (tpl) => tpl.name === t.template_name && tpl.language === t.template_language,
            );
            const totalVars = templateSeleccionada?.placeholders.totalVariables ?? 0;

            return (
              <div key={cfg.key} className="flex flex-col gap-2">
                {cfg.key === "wiser_review_request" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full shrink-0 border-primary/30"
                    onClick={() => setModalWiserAbierto(true)}
                  >
                    URL webhook (Wiser) y prueba
                  </Button>
                ) : null}
                <TriggerCardPedido
                  icon={cfg.icon}
                  trigger={t as Trigger & { trigger_key: TriggerKeyPedido }}
                  meta={{ titulo: cfg.titulo, descripcion: cfg.descripcion }}
                  opcionesEstadosWoo={estadosWoo}
                  templates={templates}
                  templateSeleccionada={templateSeleccionada}
                  totalVars={totalVars}
                  guardando={guardandoKey === t.trigger_key}
                  onActualizar={(patch) => actualizarTrigger(t.trigger_key, patch)}
                  testOrderId={testOrderIds[keyPedido]}
                  onTestOrderIdChange={(value) => setTestOrderIds((prev) => ({ ...prev, [keyPedido]: value }))}
                  onProbar={() => void probarPedido(keyPedido)}
                  opcionesMapeo={cfg.key === "wiser_review_request" ? CAMPOS_REVIEW_WEBHOOK : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>

      <CarritoAbandonadoDialog
        open={modalCarritoAbierto}
        onOpenChange={setModalCarritoAbierto}
        trigger={cartTrigger}
        templates={templates}
        guardando={guardandoKey === "cart_abandoned"}
        onActualizar={(patch) => actualizarTrigger("cart_abandoned", patch)}
      />

      <WiserReviewWebhookDialog
        open={modalWiserAbierto}
        onOpenChange={setModalWiserAbierto}
        trigger={wiserTrigger}
        templates={templates}
        guardando={guardandoKey === "wiser_review_request"}
        onActualizar={(patch) => actualizarTrigger("wiser_review_request", patch)}
      />
    </div>
  );
}

type TriggerCardPedidoProps = {
  icon: LucideIcon;
  trigger: Trigger & { trigger_key: TriggerKeyPedido };
  meta: { titulo: string; descripcion: string };
  opcionesEstadosWoo: OpcionEstadoPedidoWoo[];
  templates: TemplateLista[];
  templateSeleccionada?: TemplateLista;
  totalVars: number;
  guardando: boolean;
  onActualizar: (patch: Partial<Trigger>) => void;
  testOrderId: string;
  onTestOrderIdChange: (value: string) => void;
  onProbar: () => void;
  /** Si se omite, se usan los campos estándar de pedido Woo. */
  opcionesMapeo?: ReadonlyArray<{ key: string; label: string }>;
};

function TriggerCardPedido({
  icon: Icon,
  trigger,
  meta,
  opcionesEstadosWoo,
  templates,
  templateSeleccionada,
  totalVars,
  guardando,
  onActualizar,
  testOrderId,
  onTestOrderIdChange,
  onProbar,
  opcionesMapeo: opcionesMapeoProp,
}: TriggerCardPedidoProps) {
  const opcionesMapeo = opcionesMapeoProp ?? CAMPOS_PEDIDO;
  const slugsServidor = trigger.woo_status_slugs ?? [];
  const [disparoModo, setDisparoModo] = useState<"auto" | "custom">(() =>
    slugsServidor.length > 0 ? "custom" : "auto",
  );
  const [slugsSeleccion, setSlugsSeleccion] = useState<string[]>(() => [...slugsServidor]);
  const [filtroEstado, setFiltroEstado] = useState("");

  const [mapping, setMapping] = useState<Record<string, string>>(trigger.variable_mapping ?? {});
  useEffect(() => {
    setMapping(trigger.variable_mapping ?? {});
  }, [trigger.variable_mapping]);

  useEffect(() => {
    const s = trigger.woo_status_slugs ?? [];
    setDisparoModo(s.length > 0 ? "custom" : "auto");
    setSlugsSeleccion([...s]);
  }, [trigger.trigger_key, trigger.updated_at]);

  const cabeceraMultimedia = plantillaUsaCabeceraMultimedia(templateSeleccionada);

  const templateKey = templateSeleccionada
    ? `${templateSeleccionada.name}::${templateSeleccionada.language}`
    : "";

  const guardarMapping = () => {
    onActualizar({ variable_mapping: mapping });
  };

  const cambioPendiente = useMemo(
    () => JSON.stringify(mapping) !== JSON.stringify(trigger.variable_mapping ?? {}),
    [mapping, trigger.variable_mapping],
  );

  const estadosFiltrados = useMemo(() => {
    const q = filtroEstado.trim().toLowerCase();
    if (!q) return opcionesEstadosWoo;
    return opcionesEstadosWoo.filter(
      (o) => o.slug.toLowerCase().includes(q) || o.label.toLowerCase().includes(q),
    );
  }, [filtroEstado, opcionesEstadosWoo]);

  const disparoCambiado = useMemo(() => {
    if (disparoModo === "auto") return slugsServidor.length > 0;
    return !slugsOrdenadosIguales(slugsSeleccion, slugsServidor);
  }, [disparoModo, slugsSeleccion, slugsServidor]);

  const guardarDisparo = () => {
    if (disparoModo === "custom" && slugsSeleccion.length === 0) {
      toast.error("Elegí al menos un estado Woo o volvé a «Predeterminado».");
      return;
    }
    onActualizar({
      woo_status_slugs: disparoModo === "auto" ? [] : slugsSeleccion.map((s) => normalizarSlugEstadoPedidoWoo(s)),
    });
  };

  const toggleSlug = (slug: string) => {
    const n = normalizarSlugEstadoPedidoWoo(slug);
    setSlugsSeleccion((prev) => (prev.includes(n) ? prev.filter((s) => s !== n) : [...prev, n]));
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-1 flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base leading-snug">{meta.titulo}</CardTitle>
            <CardDescription className="mt-1">{meta.descripcion}</CardDescription>
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm sm:flex-col sm:items-end">
          <span>{trigger.enabled ? "Activo" : "Desactivado"}</span>
          <Switch
            checked={trigger.enabled}
            onCheckedChange={(value) => onActualizar({ enabled: value })}
            disabled={guardando}
          />
        </label>
      </CardHeader>
      <CardContent className="mt-auto space-y-3 pt-0">
        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-sm font-medium">Disparo</Label>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!disparoCambiado || guardando}
              onClick={() => guardarDisparo()}
            >
              {guardando ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar disparo
            </Button>
          </div>
          <Select
            value={disparoModo}
            onValueChange={(v) => {
              const modo = v as "auto" | "custom";
              setDisparoModo(modo);
              if (modo === "auto") setSlugsSeleccion([]);
            }}
            disabled={guardando}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Predeterminado (reglas por tipo de notificación)</SelectItem>
              <SelectItem value="custom">Estado de pedido Woo (elegir slugs)</SelectItem>
            </SelectContent>
          </Select>
          {disparoModo === "custom" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Match exacto con el slug del pedido al cambiar de estado. Evitá repetir el mismo slug en dos
                notificaciones distintas.
              </p>
              {opcionesEstadosWoo.length === 0 ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No se cargó el catálogo Woo (revisá credenciales / API). Podés guardar slugs si los conocés: no
                  aparecen hasta recargar con API OK.
                </p>
              ) : null}
              <Input
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                placeholder="Buscar estado…"
                disabled={guardando}
                className="h-8 text-sm"
              />
              <div className="max-h-40 space-y-1.5 overflow-y-auto rounded border border-border/80 bg-background/50 p-2">
                {estadosFiltrados.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin coincidencias.</p>
                ) : (
                  estadosFiltrados.map((o) => {
                    const marcado = slugsSeleccion.includes(normalizarSlugEstadoPedidoWoo(o.slug));
                    return (
                      <label
                        key={o.slug}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={marcado}
                          onCheckedChange={() => toggleSlug(o.slug)}
                          disabled={guardando}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-mono text-xs text-muted-foreground">{o.slug}</span>
                          <span className="ml-2 text-foreground">{o.label}</span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Seleccionados: {slugsSeleccion.length}
                {slugsSeleccion.length > 0 ? (
                  <span className="ml-1 font-mono">({slugsSeleccion.slice(0, 6).join(", ")}
                  {slugsSeleccion.length > 6 ? "…" : ""})</span>
                ) : null}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Meta usa las reglas por defecto según el nombre de esta notificación (p. ej. failed → pedido fallido).
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select
              value={templateKey}
              onValueChange={(v) => {
                const [name, language] = v.split("::");
                onActualizar({ template_name: name, template_language: language });
              }}
              disabled={guardando}
            >
              <SelectTrigger>
                <SelectValue placeholder="Elegí un template aprobado…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                    {t.name} · {t.language}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {cabeceraMultimedia ? (
          <div className="space-y-1.5">
            <Label htmlFor={`wa-header-media-${trigger.trigger_key}`}>URL cabecera (HTTPS público)</Label>
            <Input
              id={`wa-header-media-${trigger.trigger_key}`}
              key={`${trigger.trigger_key}-hdr-${trigger.updated_at}`}
              defaultValue={trigger.template_header_media_url ?? ""}
              disabled={guardando}
              placeholder="https://…"
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                const prev = (trigger.template_header_media_url ?? "").trim() || null;
                if (v !== prev) onActualizar({ template_header_media_url: v });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Obligatorio si el template tiene cabecera imagen, video o documento en Meta.
            </p>
          </div>
        ) : null}

        {totalVars > 0 ? (
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-medium">Mapeo de variables</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: totalVars }, (_, i) => {
                const idx = String(i + 1);
                return (
                  <div key={idx} className="space-y-1">
                    <Label>
                      {`{{${idx}}}`} →
                    </Label>
                    <Select
                      value={mapping[idx] ?? ""}
                      onValueChange={(v) =>
                        setMapping((prev) => ({ ...prev, [idx]: v }))
                      }
                      disabled={guardando}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Elegí un campo del pedido…" />
                      </SelectTrigger>
                      <SelectContent>
                        {opcionesMapeo.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.label} <code className="ml-1 text-xs text-muted-foreground">{c.key}</code>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={guardarMapping} disabled={!cambioPendiente || guardando}>
                {guardando ? <Loader2 className="size-4 animate-spin" /> : null}
                Guardar mapeo
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`wa-test-${trigger.trigger_key}`}>Probar con orderId</Label>
            <Input
              id={`wa-test-${trigger.trigger_key}`}
              type="number"
              value={testOrderId}
              onChange={(event) => onTestOrderIdChange(event.target.value)}
              placeholder="Ej: 12345"
            />
          </div>
          <Button size="sm" variant="outline" onClick={onProbar}>
            <Beaker className="size-4" /> Probar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type CarritoAbandonadoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: Trigger | undefined;
  templates: TemplateLista[];
  guardando: boolean;
  onActualizar: (patch: Partial<Trigger>) => void;
};

function CarritoAbandonadoDialog({
  open,
  onOpenChange,
  trigger,
  templates,
  guardando,
  onActualizar,
}: CarritoAbandonadoDialogProps) {
  const [origen, setOrigen] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [testPhone, setTestPhone] = useState("");
  const [testNombre, setTestNombre] = useState("");
  const [testUrl, setTestUrl] = useState("");
  const [testTotal, setTestTotal] = useState("");
  const [testMoneda, setTestMoneda] = useState("UYU");

  useEffect(() => {
    setOrigen(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    if (trigger?.variable_mapping) setMapping(trigger.variable_mapping);
  }, [trigger?.variable_mapping, open]);

  const urlWebhookCompleta = origen ? `${origen}${RUTA_WEBHOOK_CARRITO}` : RUTA_WEBHOOK_CARRITO;

  const copiarUrl = () => {
    void navigator.clipboard.writeText(urlWebhookCompleta).then(() => {
      toast.success("URL copiada.");
    });
  };

  const templateSeleccionada = trigger
    ? templates.find((tpl) => tpl.name === trigger.template_name && tpl.language === trigger.template_language)
    : undefined;
  const templateKey = templateSeleccionada
    ? `${templateSeleccionada.name}::${templateSeleccionada.language}`
    : "";
  const totalVars = templateSeleccionada?.placeholders.totalVariables ?? 0;
  const cabeceraMultimedia = plantillaUsaCabeceraMultimedia(templateSeleccionada);

  const cambioPendiente = useMemo(
    () => JSON.stringify(mapping) !== JSON.stringify(trigger?.variable_mapping ?? {}),
    [mapping, trigger?.variable_mapping],
  );

  const guardarMapping = () => {
    onActualizar({ variable_mapping: mapping });
  };

  const probar = async () => {
    const phone = testPhone.trim();
    if (!phone) {
      toast.error("Ingresá un teléfono de prueba (con código país).");
      return;
    }
    const payload: Record<string, string> = { phone };
    if (testNombre.trim()) payload.first_name = testNombre.trim();
    if (testUrl.trim()) payload.cart_url = testUrl.trim();
    if (testTotal.trim()) payload.total = testTotal.trim();
    if (testMoneda.trim()) payload.currency = testMoneda.trim();
    try {
      const res = await fetch("/api/admin/whatsapp/triggers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerKey: "cart_abandoned", payload }),
      });
      const data = (await res.json()) as { ok?: boolean; motivo?: string; telefono?: string };
      if (data.ok) {
        toast.success(`Enviado a ${data.telefono}.`);
      } else {
        toast.error(`No se envió: ${data.motivo ?? "desconocido"}`);
      }
    } catch (error) {
      toast.error("Error en prueba.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" showClose>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <ShoppingCart className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <div>
              <DialogTitle>Carrito abandonado · FunnelKit</DialogTitle>
              <DialogDescription>
                Outgoing webhook POST con JSON; autenticación con{" "}
                <code className="rounded bg-muted px-1">FUNNELKIT_CART_WEBHOOK_SECRET</code> (header{" "}
                <code className="rounded bg-muted px-1">X-Funnelkit-Secret</code>,{" "}
                <code className="rounded bg-muted px-1">Authorization: Bearer …</code> o query{" "}
                <code className="rounded bg-muted px-1">?token=…</code>
                ).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!trigger ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            No existe la fila <code className="text-xs">cart_abandoned</code> en la base. Ejecutá la migración{" "}
            <code className="text-xs">schema_phase10_whatsapp_cart_abandoned.sql</code> en Supabase.
          </p>
        ) : (
          <>
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">URL del webhook</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full flex-1 break-all rounded bg-background px-2 py-1 text-xs">{urlWebhookCompleta}</code>
                <Button type="button" size="sm" variant="outline" onClick={copiarUrl}>
                  <Copy className="size-4" /> Copiar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                En FunnelKit creá una automatización “Webhook / HTTP Request” al abandonar carrito; cuerpo JSON con al
                menos <code className="rounded bg-muted px-0.5">phone</code> (o campos que mapees a billing.phone). Los
                merge tags dependen de tu plantilla FunnelKit.
              </p>
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-background p-2 text-xs leading-relaxed text-muted-foreground">
{`{
  "phone": "+59899123456",
  "first_name": "Nombre",
  "cart_url": "https://tu-tienda.com/checkout/?recover=…",
  "total": "1500",
  "currency": "UYU"
}`}
              </pre>
            </div>

            <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
              <span className="text-sm">{trigger.enabled ? "Activo" : "Desactivado"}</span>
              <Switch
                checked={trigger.enabled}
                onCheckedChange={(value) => onActualizar({ enabled: value })}
                disabled={guardando}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Template Meta (aprobado)</Label>
              <Select
                value={templateKey}
                onValueChange={(v) => {
                  const [name, language] = v.split("::");
                  onActualizar({ template_name: name, template_language: language });
                }}
                disabled={guardando}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                      {t.name} · {t.language}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {cabeceraMultimedia ? (
              <div className="space-y-1.5">
                <Label htmlFor="wa-cart-header-media">URL cabecera (HTTPS público)</Label>
                <Input
                  id="wa-cart-header-media"
                  key={`cart-hdr-${trigger.updated_at}`}
                  defaultValue={trigger.template_header_media_url ?? ""}
                  disabled={guardando}
                  placeholder="https://…"
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    const prev = (trigger.template_header_media_url ?? "").trim() || null;
                    if (v !== prev) onActualizar({ template_header_media_url: v });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Meta lo exige para plantillas con imagen/video/documento en cabecera; guardá con tab o clic fuera antes
                  de probar.
                </p>
              </div>
            ) : null}

            {totalVars > 0 ? (
              <div className="rounded-md border border-border p-3">
                <p className="mb-2 text-sm font-medium">Mapeo de variables → payload normalizado</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Array.from({ length: totalVars }, (_, i) => {
                    const idx = String(i + 1);
                    return (
                      <div key={idx} className="space-y-1">
                        <Label>{`{{${idx}}}`} →</Label>
                        <Select
                          value={mapping[idx] ?? ""}
                          onValueChange={(v) => setMapping((prev) => ({ ...prev, [idx]: v }))}
                          disabled={guardando}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Campo…" />
                          </SelectTrigger>
                          <SelectContent>
                            {CAMPOS_CARRITO_ABANDONADO.map((c) => (
                              <SelectItem key={c.key} value={c.key}>
                                {c.label}{" "}
                                <code className="ml-1 text-xs text-muted-foreground">{c.key}</code>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" onClick={guardarMapping} disabled={!cambioPendiente || guardando}>
                    {guardando ? <Loader2 className="size-4 animate-spin" /> : null}
                    Guardar mapeo
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-dashed border-border p-3">
              <p className="mb-2 text-sm font-medium">Probar envío</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wa-cart-test-phone">Teléfono</Label>
                  <Input
                    id="wa-cart-test-phone"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="+59899123456"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-cart-test-nombre">Nombre (opcional)</Label>
                  <Input
                    id="wa-cart-test-nombre"
                    value={testNombre}
                    onChange={(e) => setTestNombre(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="wa-cart-test-url">URL carrito (opcional)</Label>
                  <Input
                    id="wa-cart-test-url"
                    value={testUrl}
                    onChange={(e) => setTestUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-cart-test-total">Total (opcional)</Label>
                  <Input
                    id="wa-cart-test-total"
                    value={testTotal}
                    onChange={(e) => setTestTotal(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-cart-test-moneda">Moneda</Label>
                  <Input
                    id="wa-cart-test-moneda"
                    value={testMoneda}
                    onChange={(e) => setTestMoneda(e.target.value)}
                  />
                </div>
              </div>
              <Button type="button" className="mt-3" size="sm" variant="outline" onClick={() => void probar()}>
                <Beaker className="size-4" /> Probar WhatsApp
              </Button>
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type WiserReviewWebhookDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: Trigger | undefined;
  templates: TemplateLista[];
  guardando: boolean;
  onActualizar: (patch: Partial<Trigger>) => void;
};

function WiserReviewWebhookDialog({
  open,
  onOpenChange,
  trigger,
  templates,
  guardando,
  onActualizar,
}: WiserReviewWebhookDialogProps) {
  const [origen, setOrigen] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [testPhone, setTestPhone] = useState("");
  const [testNombre, setTestNombre] = useState("");
  const [testReviewUrl, setTestReviewUrl] = useState("");
  const [testProductName, setTestProductName] = useState("");
  const [testOrderId, setTestOrderId] = useState("");

  useEffect(() => {
    setOrigen(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    if (trigger?.variable_mapping) setMapping(trigger.variable_mapping);
  }, [trigger?.variable_mapping, open]);

  const urlWebhookCompleta = origen ? `${origen}${RUTA_WEBHOOK_WISER}` : RUTA_WEBHOOK_WISER;

  const copiarUrl = () => {
    void navigator.clipboard.writeText(urlWebhookCompleta).then(() => {
      toast.success("URL copiada.");
    });
  };

  const templateSeleccionada = trigger
    ? templates.find((tpl) => tpl.name === trigger.template_name && tpl.language === trigger.template_language)
    : undefined;
  const templateKey = templateSeleccionada
    ? `${templateSeleccionada.name}::${templateSeleccionada.language}`
    : "";
  const totalVars = templateSeleccionada?.placeholders.totalVariables ?? 0;
  const cabeceraMultimedia = plantillaUsaCabeceraMultimedia(templateSeleccionada);

  const cambioPendiente = useMemo(
    () => JSON.stringify(mapping) !== JSON.stringify(trigger?.variable_mapping ?? {}),
    [mapping, trigger?.variable_mapping],
  );

  const guardarMapping = () => {
    onActualizar({ variable_mapping: mapping });
  };

  const probar = async () => {
    const phone = testPhone.trim();
    if (!phone) {
      toast.error("Ingresá un teléfono de prueba (con código país).");
      return;
    }
    const payload: Record<string, string | number> = { customer_number: phone };
    if (testNombre.trim()) payload.customer_name = testNombre.trim();
    if (testReviewUrl.trim()) payload.product_review_url = testReviewUrl.trim();
    if (testProductName.trim()) payload.product_name = testProductName.trim();
    const oid = Number(testOrderId.trim());
    if (Number.isFinite(oid) && oid > 0) payload.order_id = oid;
    try {
      const res = await fetch("/api/admin/whatsapp/triggers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerKey: "wiser_review_request", payload }),
      });
      const data = (await res.json()) as { ok?: boolean; motivo?: string; telefono?: string };
      if (data.ok) {
        toast.success(`Enviado a ${data.telefono}.`);
      } else {
        toast.error(`No se envió: ${data.motivo ?? "desconocido"}`);
      }
    } catch (error) {
      toast.error("Error en prueba.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" showClose>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Star className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <div>
              <DialogTitle>Reseñas · webhook Wiser</DialogTitle>
              <DialogDescription>
                Pegá la URL en WiserReview (Webhook Alert). POST con el JSON de su{" "}
                <a
                  className="underline underline-offset-2"
                  href="https://wiserreview.com/docs/integration/webhook-alert-for-request-trigger-used-for-get-event-alert/"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  documentación
                </a>
                . Secreto <code className="rounded bg-muted px-1">WISER_REVIEW_WEBHOOK_SECRET</code> en Vercel — mismo
                valor en <code className="rounded bg-muted px-1">X-Wiser-Secret</code>,{" "}
                <code className="rounded bg-muted px-1">X-WiserNotify-Secret</code>,{" "}
                <code className="rounded bg-muted px-1">X-Webhook-Secret</code>,{" "}
                <code className="rounded bg-muted px-1">Authorization: Bearer …</code> o{" "}
                <code className="rounded bg-muted px-1">?token=…</code>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!trigger ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            No existe la fila <code className="text-xs">wiser_review_request</code> en la base. Ejecutá la migración de
            triggers en Supabase.
          </p>
        ) : (
          <>
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">Endpoint URL (copiar en Wiser)</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full flex-1 break-all rounded bg-background px-2 py-1 text-xs">
                  {urlWebhookCompleta}
                </code>
                <Button type="button" size="sm" variant="outline" onClick={copiarUrl}>
                  <Copy className="size-4" /> Copiar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Con <code className="rounded bg-muted px-0.5">order_id</code> válido en Woo se mezcla el pedido REST;{" "}
                <code className="rounded bg-muted px-0.5">customer_number</code>,{" "}
                <code className="rounded bg-muted px-0.5">customer_name</code>,{" "}
                <code className="rounded bg-muted px-0.5">product_review_url</code> /{" "}
                <code className="rounded bg-muted px-0.5">brand_product_review_url</code> y{" "}
                <code className="rounded bg-muted px-0.5">product_name</code> del JSON pisan huecos del pedido.
              </p>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-background p-2 text-xs leading-relaxed text-muted-foreground">
{`{
  "event_type": "on_order_fulfill",
  "customer_number": "+59899123456",
  "customer_name": "María García",
  "customer_email": "maria@ejemplo.com",
  "product_name": "Galletitas rellenas x 12u",
  "product_id": "456",
  "order_id": "12345",
  "product_review_url": "https://tu-tienda.com/review/…",
  "brand_product_review_url": "https://tu-tienda.com/reviews",
  "discount_code": "",
  "discount_value": ""
}`}
              </pre>
            </div>

            <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
              <span className="text-sm">{trigger.enabled ? "Activo" : "Desactivado"}</span>
              <Switch
                checked={trigger.enabled}
                onCheckedChange={(value) => onActualizar({ enabled: value })}
                disabled={guardando}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Template Meta (aprobado)</Label>
              <Select
                value={templateKey}
                onValueChange={(v) => {
                  const [name, language] = v.split("::");
                  onActualizar({ template_name: name, template_language: language });
                }}
                disabled={guardando}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={`${tpl.name}::${tpl.language}`} value={`${tpl.name}::${tpl.language}`}>
                      {tpl.name} · {tpl.language}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {cabeceraMultimedia ? (
              <div className="space-y-1.5">
                <Label htmlFor="wa-wiser-header-media">URL cabecera (HTTPS público)</Label>
                <Input
                  id="wa-wiser-header-media"
                  key={`wiser-hdr-${trigger.updated_at}`}
                  defaultValue={trigger.template_header_media_url ?? ""}
                  disabled={guardando}
                  placeholder="https://…"
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    const prev = (trigger.template_header_media_url ?? "").trim() || null;
                    if (v !== prev) onActualizar({ template_header_media_url: v });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Obligatorio si el template tiene cabecera multimedia en Meta.
                </p>
              </div>
            ) : null}

            {totalVars > 0 ? (
              <div className="rounded-md border border-border p-3">
                <p className="mb-2 text-sm font-medium">Mapeo de variables (WiserReview + pedido Woo)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Array.from({ length: totalVars }, (_, i) => {
                    const idx = String(i + 1);
                    return (
                      <div key={idx} className="space-y-1">
                        <Label>{`{{${idx}}}`} →</Label>
                        <Select
                          value={mapping[idx] ?? ""}
                          onValueChange={(v) => setMapping((prev) => ({ ...prev, [idx]: v }))}
                          disabled={guardando}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Campo…" />
                          </SelectTrigger>
                          <SelectContent>
                            {CAMPOS_REVIEW_WEBHOOK.map((c) => (
                              <SelectItem key={c.key} value={c.key}>
                                {c.label}{" "}
                                <code className="ml-1 text-xs text-muted-foreground">{c.key}</code>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" onClick={guardarMapping} disabled={!cambioPendiente || guardando}>
                    {guardando ? <Loader2 className="size-4 animate-spin" /> : null}
                    Guardar mapeo
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-dashed border-border p-3">
              <p className="mb-2 text-sm font-medium">Probar envío (admin)</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wa-wiser-test-phone">customer_number *</Label>
                  <Input
                    id="wa-wiser-test-phone"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="+59899123456"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-wiser-test-nombre">customer_name (opcional)</Label>
                  <Input
                    id="wa-wiser-test-nombre"
                    value={testNombre}
                    onChange={(e) => setTestNombre(e.target.value)}
                    placeholder="Nombre o nombre completo"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="wa-wiser-test-product">product_name (opcional)</Label>
                  <Input
                    id="wa-wiser-test-product"
                    value={testProductName}
                    onChange={(e) => setTestProductName(e.target.value)}
                    placeholder="Texto para {{2}} en el template"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="wa-wiser-test-url">product_review_url (opcional)</Label>
                  <Input
                    id="wa-wiser-test-url"
                    value={testReviewUrl}
                    onChange={(e) => setTestReviewUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="wa-wiser-test-order">order_id Woo (opcional)</Label>
                  <Input
                    id="wa-wiser-test-order"
                    type="number"
                    value={testOrderId}
                    onChange={(e) => setTestOrderId(e.target.value)}
                    placeholder="Ej. 12345"
                  />
                </div>
              </div>
              <Button type="button" className="mt-3" size="sm" variant="outline" onClick={() => void probar()}>
                <Beaker className="size-4" /> Probar WhatsApp
              </Button>
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
