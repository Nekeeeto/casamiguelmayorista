"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CopyPlus, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";

import {
  WhatsappMetaTemplateEditorDialog,
  type PlantillaDuplicarPayload,
} from "@/components/admin/whatsapp-meta-template-editor-dialog";
import { WhatsappTemplateLivePreview } from "@/components/admin/whatsapp-template-live-preview";
import { Badge } from "@/components/ui/badge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WhatsappTemplateComponent } from "@/lib/whatsapp-cloud-api";
import { cn } from "@/lib/utils";
import { formularioDesdeComponentesMeta } from "@/lib/whatsapp-meta-template-payload";
import type { TemplatePlaceholders } from "@/lib/whatsapp-templates";
import { etiquetaSlot, extraerPlaceholders } from "@/lib/whatsapp-templates";

type TemplateRespuesta = {
  id: string | null;
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";
  placeholders: TemplatePlaceholders;
  components: WhatsappTemplateComponent[];
};

const CATEGORIA_LABEL: Record<TemplateRespuesta["category"], string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidad",
  AUTHENTICATION: "Autenticación",
};

const ESTADO_LABEL: Record<TemplateRespuesta["status"], string> = {
  APPROVED: "Aprobado",
  PENDING: "Pendiente",
  REJECTED: "Rechazado",
  PAUSED: "Pausado",
  DISABLED: "Deshabilitado",
};

type VarianteBadge = "default" | "success" | "warning" | "destructive";

function varianteEstado(estado: TemplateRespuesta["status"]): VarianteBadge {
  if (estado === "APPROVED") return "success";
  if (estado === "REJECTED" || estado === "DISABLED") return "destructive";
  return "warning";
}

function vistaPreviaCorta(t: TemplateRespuesta): string {
  const body = t.placeholders.body?.texto?.trim();
  if (body) return body.length > 90 ? `${body.slice(0, 90)}…` : body;
  if (t.placeholders.headerFormat && t.placeholders.headerFormat !== "TEXT") {
    return `[Header ${t.placeholders.headerFormat}]`;
  }
  return "—";
}

export function WhatsappTemplatesTab() {
  const [cargando, setCargando] = useState(true);
  const [templates, setTemplates] = useState<TemplateRespuesta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("all");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [editorAbierto, setEditorAbierto] = useState(false);
  const [duplicarDe, setDuplicarDe] = useState<PlantillaDuplicarPayload | null>(null);
  const [borrarMetaId, setBorrarMetaId] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [analyticsTexto, setAnalyticsTexto] = useState<string | null>(null);
  const [analyticsCargando, setAnalyticsCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/whatsapp/templates?soloAprobados=false", {
        cache: "no-store",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { templates: TemplateRespuesta[] };
      setTemplates(data.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
      toast.error("No se pudieron listar los templates.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtradas = useMemo(() => {
    let list = templates;
    const q = filtro.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || t.language.toLowerCase().includes(q),
      );
    }
    if (filtroEstado !== "all") {
      list = list.filter((t) => t.status === filtroEstado);
    }
    return list;
  }, [filtro, filtroEstado, templates]);

  const activa = useMemo(
    () => templates.find((t) => `${t.name}-${t.language}` === seleccionada) ?? null,
    [seleccionada, templates],
  );

  const valoresPreviewTab = useMemo(() => {
    if (!activa) return [];
    const ph = extraerPlaceholders(activa.components ?? []);
    const vals = ph.orderedSlots.map((_, i) => `Ejemplo ${i + 1}`);
    const suf = ph.urlButtonsDinamicos.map(() => "demo-sufijo");
    return [...vals, ...suf];
  }, [activa]);

  useEffect(() => {
    if (!activa?.id) {
      setAnalyticsTexto(null);
      return;
    }
    let cancelado = false;
    setAnalyticsCargando(true);
    void fetch(
      `/api/admin/whatsapp/templates/analytics?templateId=${encodeURIComponent(activa.id)}`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        const j = (await res.json()) as { ok?: boolean; data?: unknown; error?: string };
        if (cancelado) return;
        if (j.ok) setAnalyticsTexto(JSON.stringify(j.data, null, 2));
        else setAnalyticsTexto(j.error ?? `HTTP ${res.status}`);
      })
      .catch(() => {
        if (!cancelado) setAnalyticsTexto("No se pudo cargar analytics.");
      })
      .finally(() => {
        if (!cancelado) setAnalyticsCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [activa?.id]);

  const abrirNueva = () => {
    setDuplicarDe(null);
    setEditorAbierto(true);
  };

  const abrirDuplicar = (t: TemplateRespuesta) => {
    const fragmentos = formularioDesdeComponentesMeta(t.components as WhatsappTemplateComponent[]);
    const payload: PlantillaDuplicarPayload = {
      nombreSugerido: `${t.name}_copia`,
      idioma: t.language,
      categoria: t.category,
      ...fragmentos,
    };
    setDuplicarDe(payload);
    setEditorAbierto(true);
  };

  const confirmarBorrar = async () => {
    if (!borrarMetaId) return;
    setBorrando(true);
    try {
      const res = await fetch(`/api/admin/whatsapp/templates/${encodeURIComponent(borrarMetaId)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Plantilla eliminada en Meta.");
      setBorrarMetaId(null);
      setSeleccionada(null);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar.");
    } finally {
      setBorrando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Templates de Meta</CardTitle>
            <CardDescription>
              Listado desde tu WABA. Meta no permite cambiar el texto de una plantilla ya aprobada sobre el mismo
              nombre: usá «Nueva versión» para clonar, editar y mandar otra plantilla a revisión (nombre distinto). Las
              nuevas quedan pendientes hasta aprobación.
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-[160px] flex-1 sm:flex-initial">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                className="pl-8"
                placeholder="Buscar…"
                value={filtro}
                onChange={(event) => setFiltro(event.target.value)}
              />
            </div>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="APPROVED">Aprobado</SelectItem>
                <SelectItem value="PENDING">Pendiente</SelectItem>
                <SelectItem value="REJECTED">Rechazado</SelectItem>
                <SelectItem value="PAUSED">Pausado</SelectItem>
                <SelectItem value="DISABLED">Deshabilitado</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={abrirNueva}>
              <Plus className="size-4" /> Nueva plantilla
            </Button>
            <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando}>
              {cargando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Sincronizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4" aria-hidden />
              <div>
                <p className="font-medium">No se pudieron listar.</p>
                <p>{error}</p>
              </div>
            </div>
          ) : cargando ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando templates…
            </div>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay templates para mostrar.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">Plantilla</TableHead>
                    <TableHead className="min-w-[200px]">Vista previa</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="min-w-[120px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((t) => {
                    const rowId = `${t.name}-${t.language}`;
                    const sel = rowId === seleccionada;
                    return (
                      <TableRow
                        key={rowId}
                        className={cn("cursor-pointer", sel && "bg-muted/50")}
                        onClick={() => setSeleccionada(rowId)}
                      >
                        <TableCell className="align-top">
                          <div className="font-medium">{t.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {CATEGORIA_LABEL[t.category]} · {t.language}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[280px] align-top text-xs text-muted-foreground">
                          <span className="line-clamp-3 whitespace-pre-wrap">{vistaPreviaCorta(t)}</span>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variante={varianteEstado(t.status)}>{ESTADO_LABEL[t.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              title="Nueva versión: abre editor con el mismo contenido; guardá con otro nombre y Meta la revisa de nuevo."
                              aria-label="Nueva versión para editar y reenviar a aprobación"
                              onClick={() => abrirDuplicar(t)}
                            >
                              <CopyPlus className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:text-destructive"
                              title="Eliminar en Meta"
                              disabled={!t.id}
                              onClick={() => t.id && setBorrarMetaId(t.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vista previa</CardTitle>
          <CardDescription>
            {activa ? `${activa.name} — ${activa.language}` : "Elegí una fila para ver el contenido."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activa ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                <div className="space-y-3">
                  {activa.placeholders.header ? (
                    <div className="rounded-md border border-border bg-muted/30 p-3">
                      <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Header</p>
                      <p className="whitespace-pre-wrap">{activa.placeholders.header.texto}</p>
                    </div>
                  ) : activa.placeholders.headerFormat ? (
                    <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                      Header multimedia ({activa.placeholders.headerFormat})
                    </div>
                  ) : null}
                  {activa.placeholders.body ? (
                    <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                      <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Body</p>
                      <p className="whitespace-pre-wrap">{activa.placeholders.body.texto}</p>
                    </div>
                  ) : null}
                  {activa.placeholders.footer ? (
                    <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                      <p className="mb-1 font-medium uppercase">Footer</p>
                      <p className="whitespace-pre-wrap">{activa.placeholders.footer.texto}</p>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Simulación envío</p>
                  <WhatsappTemplateLivePreview
                    components={activa.components ?? []}
                    valoresEjemplo={valoresPreviewTab}
                  />
                </div>
              </div>

              {(() => {
                const btnComp = activa.components?.find((c) => c.type === "BUTTONS");
                const raw = btnComp?.buttons;
                if (!Array.isArray(raw) || raw.length === 0) return null;
                return (
                  <div className="rounded-md border border-border p-3">
                    <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Botones</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {raw.map((b, i) => {
                        if (!b || typeof b !== "object") return null;
                        const o = b as Record<string, unknown>;
                        const tipo = String(o.type ?? "").toUpperCase();
                        const txt = typeof o.text === "string" ? o.text : "—";
                        const url = typeof o.url === "string" ? o.url : "";
                        return (
                          <li key={i}>
                            <span className="font-medium text-foreground">{tipo}</span>: {txt}
                            {url ? (
                              <>
                                {" "}
                                · <code className="break-all rounded bg-muted px-1 text-[10px]">{url}</code>
                              </>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}

              {activa.placeholders.orderedSlots && activa.placeholders.orderedSlots.length > 0 ? (
                <div className="rounded-md border border-border p-3">
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Parámetros (orden de envío)</p>
                  <ul className="space-y-1">
                    {activa.placeholders.orderedSlots.map((slot, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        <code className="rounded bg-muted px-1">{etiquetaSlot(slot)}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : activa.placeholders.totalVariables > 0 ? (
                <div className="rounded-md border border-border p-3">
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Variables (legacy)</p>
                  <ul className="space-y-1">
                    {Array.from({ length: activa.placeholders.totalVariables }, (_, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        <code className="rounded bg-muted px-1">{`{{${i + 1}}}`}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Sin variables en cabecera/body.</p>
              )}

              {activa.id ? (
                <div className="rounded-md border border-border p-3">
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    Analytics Meta (últimos 7 días, Cloud API)
                  </p>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Requiere analytics habilitado en la WABA y permisos del token. Si falla, revisá Business Manager o la
                    documentación de Meta.
                  </p>
                  {analyticsCargando ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Cargando…
                    </p>
                  ) : analyticsTexto ? (
                    <pre className="max-h-48 overflow-auto rounded bg-muted/40 p-2 text-[11px] leading-relaxed">
                      {analyticsTexto}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin selección.</p>
          )}
        </CardContent>
      </Card>

      <WhatsappMetaTemplateEditorDialog
        abierto={editorAbierto}
        onAbiertoChange={(open) => {
          setEditorAbierto(open);
          if (!open) setDuplicarDe(null);
        }}
        onCreado={() => void cargar()}
        duplicarDe={duplicarDe}
      />

      <Dialog open={borrarMetaId !== null} onOpenChange={(o) => !o && setBorrarMetaId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar plantilla en Meta?</DialogTitle>
            <DialogDescription>
              Se borra del administrador de WhatsApp. Los envíos que la usen dejarán de funcionar. No se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBorrarMetaId(null)} disabled={borrando}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmarBorrar()}
              disabled={borrando}
            >
              {borrando ? <Loader2 className="size-4 animate-spin" /> : null}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
