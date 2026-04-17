"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RefreshCw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type TemplatePlaceholder = {
  tipo: "header" | "body" | "footer";
  texto: string;
  variables: number[];
};

type TemplatePlaceholders = {
  header: TemplatePlaceholder | null;
  body: TemplatePlaceholder | null;
  footer: TemplatePlaceholder | null;
  headerFormat: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION" | null;
  totalVariables: number;
};

type TemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  buttons?: unknown[];
};

type TemplateRespuesta = {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";
  placeholders: TemplatePlaceholders;
  components: TemplateComponent[];
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

export function WhatsappTemplatesTab() {
  const [cargando, setCargando] = useState(true);
  const [templates, setTemplates] = useState<TemplateRespuesta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [soloAprobados, setSoloAprobados] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  const cargar = useCallback(
    async (opcion: { soloAprobados: boolean }) => {
      setCargando(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/whatsapp/templates?soloAprobados=${opcion.soloAprobados ? "true" : "false"}`, {
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
    },
    [],
  );

  useEffect(() => {
    void cargar({ soloAprobados });
  }, [cargar, soloAprobados]);

  const filtradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.language.toLowerCase().includes(q),
    );
  }, [filtro, templates]);

  const activa = useMemo(
    () => templates.find((t) => `${t.name}-${t.language}` === seleccionada) ?? null,
    [seleccionada, templates],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Templates de Meta</CardTitle>
            <CardDescription>Plantillas aprobadas en tu WABA. Se sincronizan en cada apertura.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                className="pl-8"
                placeholder="Buscar…"
                value={filtro}
                onChange={(event) => setFiltro(event.target.value)}
              />
            </div>
            <Button
              variant={soloAprobados ? "default" : "outline"}
              size="sm"
              onClick={() => setSoloAprobados((v) => !v)}
            >
              {soloAprobados ? "Solo aprobados" : "Todos los estados"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void cargar({ soloAprobados })}
              disabled={cargando}
            >
              {cargando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refrescar
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
            <div className="grid gap-3 sm:grid-cols-2">
              {filtradas.map((t) => {
                const id = `${t.name}-${t.language}`;
                const activo = id === seleccionada;
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => setSeleccionada(id)}
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent",
                      activo && "border-primary/60 bg-accent/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{t.name}</span>
                      <Badge variante={varianteEstado(t.status)}>{ESTADO_LABEL[t.status]}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variante="default">{CATEGORIA_LABEL[t.category]}</Badge>
                      <span>Idioma: {t.language}</span>
                      <span>{t.placeholders.totalVariables} variables</span>
                      {t.placeholders.headerFormat && t.placeholders.headerFormat !== "TEXT" ? (
                        <span>Header: {t.placeholders.headerFormat}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vista previa</CardTitle>
          <CardDescription>
            {activa ? `${activa.name} — ${activa.language}` : "Elegí un template para ver su contenido."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activa ? (
            <div className="space-y-3 text-sm">
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
              {activa.placeholders.totalVariables > 0 ? (
                <div className="rounded-md border border-border p-3">
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Variables detectadas</p>
                  <ul className="space-y-1">
                    {Array.from({ length: activa.placeholders.totalVariables }, (_, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        <code className="rounded bg-muted px-1">{`{{${i + 1}}}`}</code> → se completa al enviar
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Sin variables — se envía tal cual.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin selección.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
