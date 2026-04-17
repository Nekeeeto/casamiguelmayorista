"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  KEYWORDS_OPT_IN_DEFAULT,
  KEYWORDS_OPT_OUT_DEFAULT,
} from "@/lib/whatsapp-optout";

type ReplyMode = "text" | "template";

type SystemTemplate = {
  key: string;
  descripcion: string;
  texto: string;
  reply_mode: ReplyMode;
  template_name: string | null;
  template_language: string | null;
  template_parameters: string[];
  updated_at: string;
};

type MetaTemplate = {
  name: string;
  language: string;
  status: string;
  placeholders: {
    totalVariables: number;
    headerFormat: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION" | null;
  };
};

function idPlantillaMeta(t: Pick<MetaTemplate, "name" | "language">): string {
  return `${t.name}\t${t.language}`;
}

function parseIdPlantillaMeta(id: string): { name: string; language: string } | null {
  const i = id.indexOf("\t");
  if (i <= 0) return null;
  return { name: id.slice(0, i), language: id.slice(i + 1) };
}

function plantillaMetaElegible(t: MetaTemplate): boolean {
  const h = t.placeholders?.headerFormat;
  return !h || h === "TEXT";
}

const ORDEN_TEMPLATE_KEYS = [
  "greeting_auto",
  "delay_auto",
  "opt_out_confirmacion",
  "opt_in_confirmacion",
] as const;

const TITULO_TEMPLATE: Record<string, string> = {
  greeting_auto: "Saludo (primer mensaje)",
  delay_auto: "Demora en respuesta",
  opt_out_confirmacion: "Baja / unsubscribe",
  opt_in_confirmacion: "Alta / subscribe",
};

type EdicionState = {
  modo: ReplyMode;
  texto: string;
  plantillaId: string;
  parametros: string[];
  original: {
    modo: ReplyMode;
    texto: string;
    plantillaId: string;
    parametros: string[];
  };
  guardando: boolean;
};

function estadoInicialDesdeServidor(t: SystemTemplate): EdicionState {
  const modo: ReplyMode = t.reply_mode === "template" ? "template" : "text";
  const plantillaId =
    t.template_name && t.template_language
      ? idPlantillaMeta({ name: t.template_name, language: t.template_language })
      : "";
  const parametros = [...(t.template_parameters ?? [])];
  const base = { modo, texto: t.texto, plantillaId, parametros };
  return {
    ...base,
    original: { ...base, parametros: [...parametros] },
    guardando: false,
  };
}

export function WhatsappSystemTemplatesTab() {
  const [cargando, setCargando] = useState(true);
  const [templates, setTemplates] = useState<SystemTemplate[]>([]);
  const [edicion, setEdicion] = useState<Record<string, EdicionState>>({});
  const [metaTemplates, setMetaTemplates] = useState<MetaTemplate[]>([]);
  const [cargandoMeta, setCargandoMeta] = useState(false);
  const [kwOptOut, setKwOptOut] = useState(KEYWORDS_OPT_OUT_DEFAULT);
  const [kwOptIn, setKwOptIn] = useState(KEYWORDS_OPT_IN_DEFAULT);
  const [greetingOn, setGreetingOn] = useState(true);
  const [delayOn, setDelayOn] = useState(false);
  const [origAuto, setOrigAuto] = useState({
    kwOptOut: KEYWORDS_OPT_OUT_DEFAULT,
    kwOptIn: KEYWORDS_OPT_IN_DEFAULT,
    greetingOn: true,
    delayOn: false,
  });
  const [guardandoAuto, setGuardandoAuto] = useState(false);

  const metaElegibles = useMemo(
    () => metaTemplates.filter(plantillaMetaElegible),
    [metaTemplates],
  );

  const templatesOrdenados = useMemo(() => {
    const rank = (k: string) => {
      const i = ORDEN_TEMPLATE_KEYS.indexOf(k as (typeof ORDEN_TEMPLATE_KEYS)[number]);
      return i === -1 ? 999 : i;
    };
    return [...templates].sort((a, b) => rank(a.key) - rank(b.key));
  }, [templates]);

  const autoCambiado =
    kwOptOut !== origAuto.kwOptOut ||
    kwOptIn !== origAuto.kwOptIn ||
    greetingOn !== origAuto.greetingOn ||
    delayOn !== origAuto.delayOn;

  const cargarMeta = useCallback(async () => {
    setCargandoMeta(true);
    try {
      const res = await fetch("/api/admin/whatsapp/templates?soloAprobados=true", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { templates: MetaTemplate[] };
      setMetaTemplates(data.templates ?? []);
    } catch {
      // silencioso: el tab puede usarse solo con texto
    } finally {
      setCargandoMeta(false);
    }
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/admin/whatsapp/system-templates", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { templates: SystemTemplate[] };
      const list: SystemTemplate[] = data.templates.map((row) => ({
        ...row,
        reply_mode: (row.reply_mode === "template" ? "template" : "text") as ReplyMode,
        template_parameters: Array.isArray(row.template_parameters) ? row.template_parameters : [],
      }));
      setTemplates(list);
      const inicial: Record<string, EdicionState> = {};
      for (const t of list) {
        inicial[t.key] = estadoInicialDesdeServidor(t);
      }
      setEdicion(inicial);
      void cargarMeta();

      const resCfg = await fetch("/api/admin/whatsapp/configuracion", { cache: "no-store" });
      if (resCfg.ok) {
        const cfg = (await resCfg.json()) as {
          automations?: {
            keywords_opt_out: string;
            keywords_opt_in: string;
            greeting_enabled: boolean;
            delay_enabled: boolean;
          };
        };
        if (cfg.automations) {
          const a = cfg.automations;
          setKwOptOut(a.keywords_opt_out);
          setKwOptIn(a.keywords_opt_in);
          setGreetingOn(a.greeting_enabled);
          setDelayOn(a.delay_enabled);
          setOrigAuto({
            kwOptOut: a.keywords_opt_out,
            kwOptIn: a.keywords_opt_in,
            greetingOn: a.greeting_enabled,
            delayOn: a.delay_enabled,
          });
        }
      }
    } catch (error) {
      toast.error("No se pudieron cargar los templates del sistema.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCargando(false);
    }
  }, [cargarMeta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const sincronizarParametrosConPlantilla = (
    plantillaId: string,
    prevParams: string[],
  ): string[] => {
    const parsed = parseIdPlantillaMeta(plantillaId);
    if (!parsed) return [];
    const meta = metaElegibles.find(
      (m) => m.name === parsed.name && m.language === parsed.language,
    );
    const n = meta?.placeholders?.totalVariables ?? 0;
    const next: string[] = [];
    for (let i = 0; i < n; i++) {
      next[i] = prevParams[i] ?? "";
    }
    return next;
  };

  const guardar = useCallback(
    async (key: string) => {
      const actual = edicion[key];
      if (!actual) return;
      const { name: template_name, language: template_language } =
        actual.modo === "template" && actual.plantillaId
          ? parseIdPlantillaMeta(actual.plantillaId) ?? { name: null, language: null }
          : { name: null, language: null };

      setEdicion((prev) => ({
        ...prev,
        [key]: { ...actual, guardando: true },
      }));
      try {
        const res = await fetch(`/api/admin/whatsapp/system-templates/${encodeURIComponent(key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            texto: actual.texto,
            reply_mode: actual.modo,
            template_name,
            template_language,
            template_parameters: actual.modo === "template" ? actual.parametros : [],
          }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? `HTTP ${res.status}`);
        }
        toast.success("Guardado.");
        setEdicion((prev) => {
          const ed = prev[key];
          if (!ed) return prev;
          const next: EdicionState = {
            ...ed,
            guardando: false,
            original: {
              modo: ed.modo,
              texto: ed.texto,
              plantillaId: ed.plantillaId,
              parametros: [...ed.parametros],
            },
          };
          return { ...prev, [key]: next };
        });
        await cargar();
      } catch (error) {
        toast.error("No se pudo actualizar.", {
          description: error instanceof Error ? error.message : undefined,
        });
        setEdicion((prev) => ({
          ...prev,
          [key]: { ...actual, guardando: false },
        }));
      }
    },
    [edicion, cargar],
  );

  const guardarAutomaciones = useCallback(async () => {
    setGuardandoAuto(true);
    try {
      const res = await fetch("/api/admin/whatsapp/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords_opt_out: kwOptOut,
          keywords_opt_in: kwOptIn,
          automation_greeting_enabled: greetingOn,
          automation_delay_enabled: delayOn,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      toast.success("Palabras y opciones guardadas.");
      setOrigAuto({
        kwOptOut,
        kwOptIn,
        greetingOn,
        delayOn,
      });
    } catch (error) {
      toast.error("No se pudo guardar.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setGuardandoAuto(false);
    }
  }, [delayOn, greetingOn, kwOptIn, kwOptOut]);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Palabras y automatizaciones</CardTitle>
          <CardDescription>
            Palabras separadas por comas: el mensaje del contacto debe ser <strong>solo</strong> esa palabra (como en
            WANotifier). Primero se evalúan baja/alta; si no coinciden y el saludo está activo, el{" "}
            <strong>primer</strong> mensaje entrante dispara el saludo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wa-kw-out">Palabras de baja (opt-out)</Label>
              <Input
                id="wa-kw-out"
                value={kwOptOut}
                onChange={(e) => setKwOptOut(e.target.value)}
                placeholder={KEYWORDS_OPT_OUT_DEFAULT}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-kw-in">Palabras de alta (opt-in)</Label>
              <Input
                id="wa-kw-in"
                value={kwOptIn}
                onChange={(e) => setKwOptIn(e.target.value)}
                placeholder={KEYWORDS_OPT_IN_DEFAULT}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Checkbox
                id="wa-greet"
                checked={greetingOn}
                onCheckedChange={(c) => setGreetingOn(c === true)}
              />
              <Label htmlFor="wa-greet" className="font-normal">
                Saludo automático (primer mensaje)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="wa-delay" checked={delayOn} onCheckedChange={(c) => setDelayOn(c === true)} />
              <Label htmlFor="wa-delay" className="font-normal">
                Demora — solo guarda plantilla (envío automático pendiente)
              </Label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void guardarAutomaciones()} disabled={!autoCambiado || guardandoAuto}>
              {guardandoAuto ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar palabras y opciones
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!autoCambiado || guardandoAuto}
              onClick={() => {
                setKwOptOut(origAuto.kwOptOut);
                setKwOptIn(origAuto.kwOptIn);
                setGreetingOn(origAuto.greetingOn);
                setDelayOn(origAuto.delayOn);
              }}
            >
              Revertir
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        En cada bloque: <strong>texto libre</strong> (sesión 24h) o <strong>plantilla Meta</strong>. Headers imagen/video
        excluidos del listado.
      </p>
      {cargandoMeta ? (
        <p className="text-xs text-muted-foreground">Cargando plantillas Meta…</p>
      ) : metaElegibles.length === 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          No hay plantillas Meta aprobadas elegibles, o falló la API. Podés usar solo texto libre hasta que haya
          templates.
        </p>
      ) : null}
      {templatesOrdenados.map((t) => {
        const ed = edicion[t.key];
        if (!ed) return null;
        const cambiado =
          ed.modo !== ed.original.modo ||
          ed.texto !== ed.original.texto ||
          ed.plantillaId !== ed.original.plantillaId ||
          ed.parametros.join("\0") !== ed.original.parametros.join("\0");
        const nVars =
          ed.modo === "template" && ed.plantillaId
            ? (metaElegibles.find(
                (m) =>
                  m.name === parseIdPlantillaMeta(ed.plantillaId)?.name &&
                  m.language === parseIdPlantillaMeta(ed.plantillaId)?.language,
              )?.placeholders.totalVariables ?? 0)
            : 0;

        const titulo = TITULO_TEMPLATE[t.key] ?? t.key;
        return (
          <Card key={t.key}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">{titulo}</CardTitle>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{t.key}</code>
                {t.key === "delay_auto" ? (
                  <Badge variante="warning">Webhook: envío no activo aún</Badge>
                ) : null}
              </div>
              <CardDescription>{t.descripcion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Tipo de respuesta</Label>
                <Select
                  value={ed.modo}
                  onValueChange={(v) => {
                    const modo = v as ReplyMode;
                    setEdicion((prev) => {
                      const cur = prev[t.key];
                      if (!cur) return prev;
                      if (modo === "text") {
                        return {
                          ...prev,
                          [t.key]: { ...cur, modo, plantillaId: "", parametros: [] },
                        };
                      }
                      let plantillaId = cur.plantillaId;
                      let parametros = cur.parametros;
                      if (!plantillaId && metaElegibles[0]) {
                        plantillaId = idPlantillaMeta(metaElegibles[0]);
                        parametros = sincronizarParametrosConPlantilla(plantillaId, []);
                      }
                      return {
                        ...prev,
                        [t.key]: {
                          ...cur,
                          modo,
                          plantillaId,
                          parametros,
                        },
                      };
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto libre</SelectItem>
                    <SelectItem value="template" disabled={metaElegibles.length === 0}>
                      Plantilla Meta
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {ed.modo === "text" ? (
                <>
                  <Textarea
                    rows={4}
                    maxLength={1024}
                    value={ed.texto}
                    onChange={(event) =>
                      setEdicion((prev) => ({
                        ...prev,
                        [t.key]: { ...prev[t.key]!, texto: event.target.value },
                      }))
                    }
                    disabled={ed.guardando}
                  />
                  <p className="text-xs text-muted-foreground">{ed.texto.length} / 1024 caracteres</p>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Plantilla</Label>
                    <Select
                      value={ed.plantillaId || undefined}
                      onValueChange={(plantillaId) => {
                        setEdicion((prev) => {
                          const cur = prev[t.key];
                          if (!cur) return prev;
                          const parametros = sincronizarParametrosConPlantilla(plantillaId, cur.parametros);
                          return { ...prev, [t.key]: { ...cur, plantillaId, parametros } };
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Elegí plantilla" />
                      </SelectTrigger>
                      <SelectContent>
                        {metaElegibles.map((m) => (
                          <SelectItem key={idPlantillaMeta(m)} value={idPlantillaMeta(m)}>
                            {m.name} ({m.language})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {nVars > 0 ? (
                    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                      <p className="text-sm font-medium">Valores de ejemplo (variables del template)</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {Array.from({ length: nVars }, (_, i) => i + 1).map((num) => (
                          <div key={num} className="space-y-1">
                            <Label className="text-xs">{`{{${num}}}`}</Label>
                            <Input
                              value={ed.parametros[num - 1] ?? ""}
                              onChange={(event) =>
                                setEdicion((prev) => {
                                  const cur = prev[t.key];
                                  if (!cur) return prev;
                                  const parametros = [...cur.parametros];
                                  parametros[num - 1] = event.target.value;
                                  return { ...prev, [t.key]: { ...cur, parametros } };
                                })
                              }
                              disabled={ed.guardando}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Modo plantilla: el cuadro de texto libre no se envía; sirve como nota interna opcional.
                  </p>
                  <Textarea
                    rows={2}
                    maxLength={1024}
                    value={ed.texto}
                    onChange={(event) =>
                      setEdicion((prev) => ({
                        ...prev,
                        [t.key]: { ...prev[t.key]!, texto: event.target.value },
                      }))
                    }
                    disabled={ed.guardando}
                    placeholder="Nota (opcional, no se envía si usás plantilla)"
                    className="text-muted-foreground"
                  />
                </>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Actualizado: {new Date(t.updated_at).toLocaleString("es-UY")}</span>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEdicion((prev) => ({
                      ...prev,
                      [t.key]: {
                        ...prev[t.key]!,
                        ...prev[t.key]!.original,
                        parametros: [...prev[t.key]!.original.parametros],
                        guardando: false,
                      },
                    }))
                  }
                  disabled={!cambiado || ed.guardando}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={() => void guardar(t.key)} disabled={!cambiado || ed.guardando}>
                  {ed.guardando ? <Loader2 className="size-4 animate-spin" /> : null}
                  Guardar
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
