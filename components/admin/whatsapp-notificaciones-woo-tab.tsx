"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Beaker, Copy, Loader2, RefreshCw, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CAMPOS_CARRITO_ABANDONADO } from "@/lib/whatsapp-woo-triggers";
import type { TriggerKey } from "@/lib/whatsapp-woo-triggers";

type TriggerKeyPedido = "order_confirmed" | "order_shipped" | "order_delivered";

type Trigger = {
  trigger_key: TriggerKey;
  enabled: boolean;
  template_name: string | null;
  template_language: string;
  variable_mapping: Record<string, string>;
  updated_at: string;
};

type TemplateLista = {
  name: string;
  language: string;
  placeholders: { totalVariables: number };
};

const KEYS_PEDIDO: TriggerKeyPedido[] = ["order_confirmed", "order_shipped", "order_delivered"];

const TITULOS: Record<TriggerKeyPedido, { titulo: string; descripcion: string }> = {
  order_confirmed: {
    titulo: "Pedido confirmado",
    descripcion: "Cuando el pedido Woo entra en estado processing.",
  },
  order_shipped: {
    titulo: "Pedido enviado",
    descripcion: "Cuando el pedido pasa a un estado de envío (shipped, enviado, para-retirar).",
  },
  order_delivered: {
    titulo: "Pedido entregado",
    descripcion: "Cuando el pedido pasa a completed.",
  },
};

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

export function WhatsappNotificacionesWooTab() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [templates, setTemplates] = useState<TemplateLista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoKey, setGuardandoKey] = useState<TriggerKey | null>(null);
  const [modalCarritoAbierto, setModalCarritoAbierto] = useState(false);
  const [testOrderIds, setTestOrderIds] = useState<Record<TriggerKeyPedido, string>>({
    order_confirmed: "",
    order_shipped: "",
    order_delivered: "",
  });

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

  const pedidoTriggers = useMemo(
    () => triggers.filter((x) => KEYS_PEDIDO.includes(x.trigger_key as TriggerKeyPedido)),
    [triggers],
  );
  const cartTrigger = useMemo(() => triggers.find((x) => x.trigger_key === "cart_abandoned"), [triggers]);

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
          <code className="rounded bg-muted px-1">/api/webhooks/woocommerce-pedidos</code>. El carrito abandonado usa
          FunnelKit (u otro) contra <code className="rounded bg-muted px-1">{RUTA_WEBHOOK_CARRITO}</code>.
        </p>
        <Button variant="outline" size="sm" onClick={() => void cargar()}>
          <RefreshCw className="size-4" /> Refrescar
        </Button>
      </div>

      {pedidoTriggers.map((t) => {
        const meta = TITULOS[t.trigger_key as TriggerKeyPedido];
        const templateSeleccionada = templates.find(
          (tpl) => tpl.name === t.template_name && tpl.language === t.template_language,
        );
        const totalVars = templateSeleccionada?.placeholders.totalVariables ?? 0;
        return (
          <TriggerCardPedido
            key={t.trigger_key}
            trigger={t as Trigger & { trigger_key: TriggerKeyPedido }}
            meta={meta}
            templates={templates}
            templateSeleccionada={templateSeleccionada}
            totalVars={totalVars}
            guardando={guardandoKey === t.trigger_key}
            onActualizar={(patch) => actualizarTrigger(t.trigger_key, patch)}
            testOrderId={testOrderIds[t.trigger_key as TriggerKeyPedido]}
            onTestOrderIdChange={(value) =>
              setTestOrderIds((prev) => ({ ...prev, [t.trigger_key as TriggerKeyPedido]: value }))
            }
            onProbar={() => void probarPedido(t.trigger_key as TriggerKeyPedido)}
          />
        );
      })}

      <Card className="border-dashed">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <ShoppingCart className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-base">Carrito abandonado</CardTitle>
              <CardDescription>
                Webhook dedicado (FunnelKit Automations u Outgoing Webhook): JSON con teléfono y datos del carrito;
                elegí template Meta y mapeo de variables en el modal.
              </CardDescription>
            </div>
          </div>
          <Button type="button" variant="secondary" onClick={() => setModalCarritoAbierto(true)}>
            Abrir configuración
          </Button>
        </CardHeader>
      </Card>

      <CarritoAbandonadoDialog
        open={modalCarritoAbierto}
        onOpenChange={setModalCarritoAbierto}
        trigger={cartTrigger}
        templates={templates}
        guardando={guardandoKey === "cart_abandoned"}
        onActualizar={(patch) => actualizarTrigger("cart_abandoned", patch)}
      />
    </div>
  );
}

type TriggerCardPedidoProps = {
  trigger: Trigger & { trigger_key: TriggerKeyPedido };
  meta: { titulo: string; descripcion: string };
  templates: TemplateLista[];
  templateSeleccionada?: TemplateLista;
  totalVars: number;
  guardando: boolean;
  onActualizar: (patch: Partial<Trigger>) => void;
  testOrderId: string;
  onTestOrderIdChange: (value: string) => void;
  onProbar: () => void;
};

function TriggerCardPedido({
  trigger,
  meta,
  templates,
  templateSeleccionada,
  totalVars,
  guardando,
  onActualizar,
  testOrderId,
  onTestOrderIdChange,
  onProbar,
}: TriggerCardPedidoProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(trigger.variable_mapping ?? {});
  useEffect(() => {
    setMapping(trigger.variable_mapping ?? {});
  }, [trigger.variable_mapping]);

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

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{meta.titulo}</CardTitle>
          <CardDescription>{meta.descripcion}</CardDescription>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span>{trigger.enabled ? "Activo" : "Desactivado"}</span>
          <Switch
            checked={trigger.enabled}
            onCheckedChange={(value) => onActualizar({ enabled: value })}
            disabled={guardando}
          />
        </label>
      </CardHeader>
      <CardContent className="space-y-3">
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
                        {CAMPOS_PEDIDO.map((c) => (
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
