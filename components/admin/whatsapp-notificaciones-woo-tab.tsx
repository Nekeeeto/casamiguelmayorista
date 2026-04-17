"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Beaker, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type TriggerKey = "order_confirmed" | "order_shipped" | "order_delivered";

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

const TITULOS: Record<TriggerKey, { titulo: string; descripcion: string }> = {
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

export function WhatsappNotificacionesWooTab() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [templates, setTemplates] = useState<TemplateLista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoKey, setGuardandoKey] = useState<TriggerKey | null>(null);
  const [testOrderIds, setTestOrderIds] = useState<Record<TriggerKey, string>>({
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

  const probar = useCallback(async (triggerKey: TriggerKey) => {
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configurá notificaciones automáticas desde WooCommerce. Requiere un webhook activo en Woo apuntando a{" "}
          <code className="rounded bg-muted px-1">/api/webhooks/woocommerce-pedidos</code>.
        </p>
        <Button variant="outline" size="sm" onClick={() => void cargar()}>
          <RefreshCw className="size-4" /> Refrescar
        </Button>
      </div>
      {triggers.map((t) => {
        const meta = TITULOS[t.trigger_key];
        const templateSeleccionada = templates.find(
          (tpl) => tpl.name === t.template_name && tpl.language === t.template_language,
        );
        const totalVars = templateSeleccionada?.placeholders.totalVariables ?? 0;
        return (
          <TriggerCard
            key={t.trigger_key}
            trigger={t}
            meta={meta}
            templates={templates}
            templateSeleccionada={templateSeleccionada}
            totalVars={totalVars}
            guardando={guardandoKey === t.trigger_key}
            onActualizar={(patch) => actualizarTrigger(t.trigger_key, patch)}
            testOrderId={testOrderIds[t.trigger_key]}
            onTestOrderIdChange={(value) =>
              setTestOrderIds((prev) => ({ ...prev, [t.trigger_key]: value }))
            }
            onProbar={() => void probar(t.trigger_key)}
          />
        );
      })}
    </div>
  );
}

type TriggerCardProps = {
  trigger: Trigger;
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

function TriggerCard({
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
}: TriggerCardProps) {
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
