"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type SystemTemplate = {
  key: string;
  descripcion: string;
  texto: string;
  updated_at: string;
};

type EdicionState = {
  textoActual: string;
  original: string;
  guardando: boolean;
};

export function WhatsappSystemTemplatesTab() {
  const [cargando, setCargando] = useState(true);
  const [templates, setTemplates] = useState<SystemTemplate[]>([]);
  const [edicion, setEdicion] = useState<Record<string, EdicionState>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/admin/whatsapp/system-templates", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { templates: SystemTemplate[] };
      setTemplates(data.templates);
      const inicial: Record<string, EdicionState> = {};
      for (const t of data.templates) {
        inicial[t.key] = { textoActual: t.texto, original: t.texto, guardando: false };
      }
      setEdicion(inicial);
    } catch (error) {
      toast.error("No se pudieron cargar los templates del sistema.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(async (key: string) => {
    const actual = edicion[key];
    if (!actual) return;
    setEdicion((prev) => ({ ...prev, [key]: { ...actual, guardando: true } }));
    try {
      const res = await fetch(`/api/admin/whatsapp/system-templates/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: actual.textoActual }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      toast.success("Template actualizado.");
      setEdicion((prev) => ({
        ...prev,
        [key]: { ...actual, guardando: false, original: actual.textoActual },
      }));
    } catch (error) {
      toast.error("No se pudo actualizar.", {
        description: error instanceof Error ? error.message : undefined,
      });
      setEdicion((prev) => ({ ...prev, [key]: { ...actual, guardando: false } }));
    }
  }, [edicion]);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Estos textos se envían como respuesta automática cuando se detectan keywords en la bandeja (ej: BAJA, ACTIVAR).
        Máx. 1024 caracteres. Sin variables.
      </p>
      {templates.map((t) => {
        const ed = edicion[t.key] ?? { textoActual: t.texto, original: t.texto, guardando: false };
        const cambiado = ed.textoActual !== ed.original;
        return (
          <Card key={t.key}>
            <CardHeader>
              <CardTitle className="font-mono text-sm">{t.key}</CardTitle>
              <CardDescription>{t.descripcion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                rows={4}
                maxLength={1024}
                value={ed.textoActual}
                onChange={(event) =>
                  setEdicion((prev) => ({
                    ...prev,
                    [t.key]: { ...ed, textoActual: event.target.value },
                  }))
                }
                disabled={ed.guardando}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{ed.textoActual.length} / 1024 caracteres</span>
                <span>Actualizado: {new Date(t.updated_at).toLocaleString("es-UY")}</span>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEdicion((prev) => ({
                      ...prev,
                      [t.key]: { ...ed, textoActual: ed.original },
                    }))
                  }
                  disabled={!cambiado || ed.guardando}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => void guardar(t.key)}
                  disabled={!cambiado || ed.guardando}
                >
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
