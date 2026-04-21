"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Loader2,
  Play,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatearTelefonoParaUi } from "@/lib/telefono-wa-uruguay";
import { etiquetaSlot, type ParamSlot, type TemplateUrlButtonDinamico } from "@/lib/whatsapp-templates";
import { cn } from "@/lib/utils";

type TemplatePlaceholders = {
  header: { tipo: string; texto: string; variables: number[] } | null;
  body: { tipo: string; texto: string; variables: number[] } | null;
  footer: { tipo: string; texto: string; variables: number[] } | null;
  headerFormat: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION" | null;
  totalVariables: number;
  orderedSlots?: ParamSlot[];
  urlButtonsDinamicos?: TemplateUrlButtonDinamico[];
};

type TemplateLista = {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  status: string;
  placeholders: TemplatePlaceholders;
};

type Estimado = {
  template: { name: string; language: string; category: TemplateLista["category"] };
  totalValidos: number;
  totalLeidos: number;
  invalidos: { input: string; motivo: string }[];
  saltadosOptOut: number;
  coste: { categoria: string; unitarioUsd: number; totalUsd: number; totalValidos: number };
  destinatarios: { telefono: string; contactId: string | null; nombre: string | null }[];
};

type BroadcastEstado = {
  id: string;
  template_name: string;
  template_language: string;
  template_category: string;
  total: number;
  delivered: number;
  failed: number;
  skipped: number;
  status: "pendiente" | "en_curso" | "completado" | "cancelado";
  created_at: string;
  coste_estimado_usd: number;
};

type ResultadoFila = {
  id: string;
  to_phone: string;
  ok: boolean | null;
  skipped: string | null;
  error: string | null;
  sent_at: string | null;
  wa_message_id: string | null;
};

type Contacto = {
  id: string;
  nombre: string;
  telefono: string;
  tags: string[];
  opted_out: boolean;
};

export function WhatsappBroadcastTab() {
  const [templates, setTemplates] = useState<TemplateLista[]>([]);
  const [cargandoTemplates, setCargandoTemplates] = useState(false);
  const [templateKey, setTemplateKey] = useState("");
  const [fuente, setFuente] = useState<"pegar" | "contactos">("pegar");
  const [numerosRaw, setNumerosRaw] = useState("");
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [tagsDisponibles, setTagsDisponibles] = useState<string[]>([]);
  const [tagsFiltro, setTagsFiltro] = useState<string[]>([]);
  const [contactoIdsSeleccionados, setContactoIdsSeleccionados] = useState<Set<string>>(new Set());
  const [variables, setVariables] = useState<string[]>([]);
  const [usarNombreComoVariable1, setUsarNombreComoVariable1] = useState(true);
  const [mediaLink, setMediaLink] = useState("");
  const [mediaFilename, setMediaFilename] = useState("");
  const [estimado, setEstimado] = useState<Estimado | null>(null);
  const [estimando, setEstimando] = useState(false);
  const [dialogConfirmar, setDialogConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [broadcastActivo, setBroadcastActivo] = useState<BroadcastEstado | null>(null);
  const [resultados, setResultados] = useState<ResultadoFila[]>([]);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const templateSeleccionada = useMemo(
    () => templates.find((t) => `${t.name}::${t.language}` === templateKey) ?? null,
    [templates, templateKey],
  );

  const slotCountBroadcast = useMemo(() => {
    if (!templateSeleccionada) return 0;
    const ph = templateSeleccionada.placeholders;
    const sl = ph.orderedSlots ?? [];
    return sl.length > 0 ? sl.length : ph.totalVariables;
  }, [templateSeleccionada]);

  const urlButtonsBroadcast = useMemo(
    () => templateSeleccionada?.placeholders.urlButtonsDinamicos ?? [],
    [templateSeleccionada],
  );

  const cargarTemplates = useCallback(async () => {
    setCargandoTemplates(true);
    try {
      const res = await fetch("/api/admin/whatsapp/templates?soloAprobados=true", { cache: "no-store" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { templates: TemplateLista[] };
      setTemplates(data.templates);
    } catch (error) {
      toast.error("No se pudieron listar templates.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCargandoTemplates(false);
    }
  }, []);

  const cargarTags = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/contactos/tags", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { tags: string[] };
      setTagsDisponibles(data.tags);
    } catch {
      // silencioso
    }
  }, []);

  const cargarContactos = useCallback(async () => {
    try {
      const params = new URLSearchParams({ optOut: "activos" });
      if (tagsFiltro.length > 0) params.set("tags", tagsFiltro.join(","));
      const res = await fetch(`/api/admin/whatsapp/contactos?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { contactos: Contacto[] };
      setContactos(data.contactos);
    } catch {
      // silencioso
    }
  }, [tagsFiltro]);

  useEffect(() => {
    void cargarTemplates();
    void cargarTags();
  }, [cargarTemplates, cargarTags]);

  useEffect(() => {
    if (fuente === "contactos") {
      void cargarContactos();
    }
  }, [fuente, cargarContactos]);

  useEffect(() => {
    if (templateSeleccionada) {
      setVariables((prev) => {
        const ph = templateSeleccionada.placeholders;
        const slotCount =
          ph.orderedSlots && ph.orderedSlots.length > 0 ? ph.orderedSlots.length : ph.totalVariables;
        const urlN = ph.urlButtonsDinamicos?.length ?? 0;
        const total = slotCount + urlN;
        const nuevo = [...prev];
        nuevo.length = total;
        for (let i = 0; i < total; i++) {
          nuevo[i] = prev[i] ?? "";
        }
        return nuevo;
      });
    } else {
      setVariables([]);
    }
  }, [templateSeleccionada]);

  const toggleContacto = (id: string) => {
    setContactoIdsSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const toggleTodosContactos = () => {
    setContactoIdsSeleccionados((prev) =>
      prev.size === contactos.length ? new Set() : new Set(contactos.map((c) => c.id)),
    );
  };

  const estimar = async () => {
    if (!templateSeleccionada) {
      toast.error("Elegí un template.");
      return;
    }
    setEstimando(true);
    setEstimado(null);
    try {
      const body: Record<string, unknown> = {
        templateName: templateSeleccionada.name,
        templateLanguage: templateSeleccionada.language,
      };
      if (fuente === "pegar") {
        body.numerosRaw = numerosRaw;
      } else {
        if (contactoIdsSeleccionados.size > 0) {
          body.contactIds = Array.from(contactoIdsSeleccionados);
        } else if (tagsFiltro.length > 0) {
          body.filtroTags = tagsFiltro;
        } else {
          toast.error("Elegí contactos o tags.");
          setEstimando(false);
          return;
        }
      }
      const res = await fetch("/api/admin/whatsapp/broadcast/estimar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Estimado;
      setEstimado(data);
      setDialogConfirmar(true);
    } catch (error) {
      toast.error("No se pudo estimar.", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setEstimando(false);
    }
  };

  const enviar = async () => {
    if (!templateSeleccionada || !estimado) return;
    setEnviando(true);
    try {
      const mediaHeader =
        templateSeleccionada.placeholders.headerFormat &&
        templateSeleccionada.placeholders.headerFormat !== "TEXT" &&
        mediaLink.trim()
          ? {
              tipo: templateSeleccionada.placeholders.headerFormat.toLowerCase() as "image" | "video" | "document",
              link: mediaLink.trim(),
              filename: mediaFilename.trim() || undefined,
            }
          : null;

      const body: Record<string, unknown> = {
        templateName: templateSeleccionada.name,
        templateLanguage: templateSeleccionada.language,
        mediaHeader,
        variablesDefault: variables,
        usarNombreComoVariable1: fuente === "contactos" && usarNombreComoVariable1,
      };
      if (fuente === "pegar") {
        body.numerosRaw = numerosRaw;
      } else if (contactoIdsSeleccionados.size > 0) {
        body.contactIds = Array.from(contactoIdsSeleccionados);
      } else {
        body.filtroTags = tagsFiltro;
      }

      const res = await fetch("/api/admin/whatsapp/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok && res.status !== 202) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { broadcastId: string; warning?: string };
      if (data.warning) toast.warning(data.warning);
      toast.success("Broadcast iniciado.");
      setDialogConfirmar(false);
      await abrirBroadcast(data.broadcastId);
    } catch (error) {
      toast.error("No se pudo enviar.", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  const cargarProgreso = useCallback(async (id: string): Promise<BroadcastEstado | null> => {
    const res = await fetch(`/api/admin/whatsapp/broadcast/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { broadcast: BroadcastEstado; resultados: ResultadoFila[] };
    setBroadcastActivo(data.broadcast);
    setResultados(data.resultados);
    return data.broadcast;
  }, []);

  const dispararSiguienteChunk = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/whatsapp/broadcast/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run-next-chunk" }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as { processed: number; remaining: number; status: string };
  }, []);

  const detenerPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const abrirBroadcast = useCallback(
    async (id: string) => {
      detenerPolling();
      const inicial = await cargarProgreso(id);
      if (!inicial) return;
      if (inicial.status === "completado" || inicial.status === "cancelado") return;

      pollingRef.current = setInterval(async () => {
        try {
          const estado = await cargarProgreso(id);
          if (!estado) return;
          if (estado.status === "completado" || estado.status === "cancelado") {
            detenerPolling();
            if (estado.status === "completado") toast.success("Broadcast completado.");
            return;
          }
          await dispararSiguienteChunk(id);
        } catch (error) {
          toast.error("Error procesando chunk.", {
            description: error instanceof Error ? error.message : undefined,
          });
          detenerPolling();
        }
      }, 3500);
    },
    [cargarProgreso, detenerPolling, dispararSiguienteChunk],
  );

  useEffect(() => () => detenerPolling(), [detenerPolling]);

  const cancelar = async () => {
    if (!broadcastActivo) return;
    try {
      const res = await fetch(`/api/admin/whatsapp/broadcast/${encodeURIComponent(broadcastActivo.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) throw new Error(await res.text());
      detenerPolling();
      toast.success("Broadcast cancelado.");
      await cargarProgreso(broadcastActivo.id);
    } catch (error) {
      toast.error("No se pudo cancelar.", { description: error instanceof Error ? error.message : undefined });
    }
  };

  const progresoPct = broadcastActivo
    ? Math.round(((broadcastActivo.delivered + broadcastActivo.failed + broadcastActivo.skipped) / Math.max(broadcastActivo.total, 1)) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Nuevo broadcast</CardTitle>
            <CardDescription>
              Enviá un template aprobado por Meta a una lista de números o a contactos filtrados por tag.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={templateKey} onValueChange={setTemplateKey} disabled={cargandoTemplates}>
                <SelectTrigger>
                  <SelectValue placeholder={cargandoTemplates ? "Cargando…" : "Elegí un template…"} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                      {t.name} · {t.category} · {t.language}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {templateSeleccionada?.placeholders.headerFormat &&
            templateSeleccionada.placeholders.headerFormat !== "TEXT" ? (
              <div className="space-y-1.5">
                <Label htmlFor="wa-media-link">Link multimedia ({templateSeleccionada.placeholders.headerFormat.toLowerCase()})</Label>
                <Input
                  id="wa-media-link"
                  value={mediaLink}
                  onChange={(event) => setMediaLink(event.target.value)}
                  placeholder="https://…"
                />
                {templateSeleccionada.placeholders.headerFormat === "DOCUMENT" ? (
                  <Input
                    value={mediaFilename}
                    onChange={(event) => setMediaFilename(event.target.value)}
                    placeholder="Nombre del archivo (opcional)"
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          {templateSeleccionada && slotCountBroadcast + urlButtonsBroadcast.length > 0 ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">Variables del template</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: slotCountBroadcast }, (_, i) => {
                  const slots = templateSeleccionada.placeholders.orderedSlots;
                  const etiqueta =
                    slots && slots[i] ? etiquetaSlot(slots[i]) : `{{${i + 1}}}`;
                  return (
                  <div key={i} className="space-y-1">
                    <Label htmlFor={`wa-var-${i + 1}`}>
                      {etiqueta}
                      {i === 0 && fuente === "contactos" && usarNombreComoVariable1 ? (
                        <span className="ml-1 text-xs text-muted-foreground">(auto: nombre del contacto)</span>
                      ) : null}
                    </Label>
                    <Input
                      id={`wa-var-${i + 1}`}
                      value={variables[i] ?? ""}
                      onChange={(event) =>
                        setVariables((prev) => {
                          const nuevo = [...prev];
                          nuevo[i] = event.target.value;
                          return nuevo;
                        })
                      }
                      placeholder={i === 0 && fuente === "contactos" && usarNombreComoVariable1 ? "Valor por defecto si no hay nombre" : "Valor"}
                    />
                  </div>
                  );
                })}
                {urlButtonsBroadcast.map((btn, j) => {
                  const i = slotCountBroadcast + j;
                  return (
                    <div key={`btn-url-${btn.indiceEnPlantilla}`} className="space-y-1 sm:col-span-2">
                      <Label htmlFor={`wa-var-url-${i}`}>
                        Sufijo URL — {btn.titulo}{" "}
                        <span className="text-xs font-normal text-muted-foreground">(Meta concatena a la URL base)</span>
                      </Label>
                      <Input
                        id={`wa-var-url-${i}`}
                        value={variables[i] ?? ""}
                        onChange={(event) =>
                          setVariables((prev) => {
                            const nuevo = [...prev];
                            nuevo[i] = event.target.value;
                            return nuevo;
                          })
                        }
                        placeholder="Ej. slug o path que completá la URL del botón"
                      />
                    </div>
                  );
                })}
              </div>
              {fuente === "contactos" ? (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={usarNombreComoVariable1}
                    onCheckedChange={(v) => setUsarNombreComoVariable1(v === true)}
                  />
                  Usar <code className="mx-1 rounded bg-muted px-1">nombre</code> del contacto para la{" "}
                  <strong>primera</strong> variable del template
                </label>
              ) : null}
            </div>
          ) : null}

          <Tabs value={fuente} onValueChange={(v) => setFuente(v as "pegar" | "contactos")}>
            <TabsList>
              <TabsTrigger value="pegar">Pegar números</TabsTrigger>
              <TabsTrigger value="contactos">Desde contactos</TabsTrigger>
            </TabsList>
            <TabsContent value="pegar">
              <div className="space-y-1.5">
                <Label htmlFor="wa-numeros">Números (uno por línea o separados por coma)</Label>
                <Textarea
                  id="wa-numeros"
                  rows={6}
                  value={numerosRaw}
                  onChange={(event) => setNumerosRaw(event.target.value)}
                  placeholder={"+598 99 123 456\n+598 98 876 543"}
                />
              </div>
            </TabsContent>
            <TabsContent value="contactos">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Filtrar por tags:</span>
                  {tagsDisponibles.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Sin tags disponibles.</span>
                  ) : (
                    tagsDisponibles.map((tag) => {
                      const activa = tagsFiltro.includes(tag);
                      return (
                        <Button
                          key={tag}
                          size="sm"
                          variant={activa ? "default" : "outline"}
                          onClick={() =>
                            setTagsFiltro((prev) => (activa ? prev.filter((t) => t !== tag) : [...prev, tag]))
                          }
                        >
                          {tag}
                        </Button>
                      );
                    })
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={contactos.length > 0 && contactoIdsSeleccionados.size === contactos.length}
                            onCheckedChange={toggleTodosContactos}
                          />
                        </TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Tags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contactos.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <Checkbox
                              checked={contactoIdsSeleccionados.has(c.id)}
                              onCheckedChange={() => toggleContacto(c.id)}
                            />
                          </TableCell>
                          <TableCell>{c.nombre || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{formatearTelefonoParaUi(c.telefono)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {c.tags.map((t) => (
                                <Badge key={t}>{t}</Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">
                  {contactoIdsSeleccionados.size > 0
                    ? `${contactoIdsSeleccionados.size} seleccionados`
                    : tagsFiltro.length > 0
                      ? "Si no seleccionás contactos puntuales, se usarán todos los que matchean las tags."
                      : "Elegí al menos una tag o seleccioná contactos."}
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => void cargarTemplates()} disabled={cargandoTemplates}>
              {cargandoTemplates ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refrescar templates
            </Button>
            <Button onClick={() => void estimar()} disabled={estimando || !templateSeleccionada}>
              {estimando ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
              Estimar y revisar
            </Button>
          </div>
        </CardContent>
      </Card>

      {broadcastActivo ? (
        <Card>
          <CardHeader className="flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Broadcast {broadcastActivo.template_name}
                <Badge
                  variante={
                    broadcastActivo.status === "completado"
                      ? "success"
                      : broadcastActivo.status === "cancelado"
                        ? "destructive"
                        : "warning"
                  }
                >
                  {broadcastActivo.status}
                </Badge>
              </CardTitle>
              <CardDescription>
                {broadcastActivo.delivered} OK · {broadcastActivo.failed} fallidos · {broadcastActivo.skipped} saltados · {broadcastActivo.total} total
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void cargarProgreso(broadcastActivo.id)}>
                <RefreshCw className="size-4" /> Refrescar
              </Button>
              {broadcastActivo.status === "en_curso" || broadcastActivo.status === "pendiente" ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await dispararSiguienteChunk(broadcastActivo.id);
                        await cargarProgreso(broadcastActivo.id);
                      } catch (error) {
                        toast.error("Error procesando.", {
                          description: error instanceof Error ? error.message : undefined,
                        });
                      }
                    }}
                  >
                    <Play className="size-4" /> Siguiente chunk
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => void cancelar()}>
                    <XCircle className="size-4" /> Cancelar
                  </Button>
                </>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full transition-all",
                  broadcastActivo.status === "completado"
                    ? "bg-primary"
                    : broadcastActivo.status === "cancelado"
                      ? "bg-destructive"
                      : "bg-primary/70",
                )}
                style={{ width: `${progresoPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {progresoPct}% procesado · Coste estimado: USD {broadcastActivo.coste_estimado_usd.toFixed(4)}
            </p>
            <div className="max-h-96 overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead>Enviado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultados.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{formatearTelefonoParaUi(r.to_phone)}</TableCell>
                      <TableCell>
                        {r.skipped ? (
                          <Badge variante="warning">Saltado · {r.skipped}</Badge>
                        ) : r.ok ? (
                          <Badge variante="success">OK</Badge>
                        ) : r.ok === false ? (
                          <Badge variante="destructive">Fallido</Badge>
                        ) : (
                          <Badge>Pendiente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.error ?? r.wa_message_id ?? ""}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.sent_at ? new Date(r.sent_at).toLocaleString("es-UY") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={dialogConfirmar} onOpenChange={setDialogConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar broadcast</DialogTitle>
            <DialogDescription>Revisá los números y el coste antes de enviar.</DialogDescription>
          </DialogHeader>
          {estimado ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p>
                  Template: <strong>{estimado.template.name}</strong> ({estimado.template.category})
                </p>
                <p>
                  Válidos para enviar: <strong>{estimado.totalValidos}</strong>
                </p>
                {estimado.saltadosOptOut > 0 ? (
                  <p className="text-amber-600 dark:text-amber-400">
                    Saltados por opt-out: <strong>{estimado.saltadosOptOut}</strong>
                  </p>
                ) : null}
                {estimado.invalidos.length > 0 ? (
                  <p className="text-destructive">
                    Inválidos: <strong>{estimado.invalidos.length}</strong>
                  </p>
                ) : null}
                <p className="mt-2">
                  Coste estimado: <strong>USD {estimado.coste.totalUsd.toFixed(4)}</strong>{" "}
                  <span className="text-muted-foreground">
                    (USD {estimado.coste.unitarioUsd.toFixed(4)} × {estimado.coste.totalValidos})
                  </span>
                </p>
              </div>
              {estimado.invalidos.length > 0 ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    <AlertTriangle className="size-3.5" /> Números inválidos (no se van a enviar)
                  </div>
                  <ul className="max-h-24 overflow-y-auto">
                    {estimado.invalidos.slice(0, 12).map((i, idx) => (
                      <li key={idx}>
                        {i.input} — {i.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {estimado.totalValidos === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <XCircle className="size-4" /> No quedan destinatarios válidos.
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
                  <CheckCircle2 className="size-4" /> Listo para enviar a {estimado.totalValidos} números.
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogConfirmar(false)} disabled={enviando}>
              Volver
            </Button>
            <Button
              onClick={() => void enviar()}
              disabled={enviando || !estimado || estimado.totalValidos === 0}
            >
              {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Enviar broadcast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
