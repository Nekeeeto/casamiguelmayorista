"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Hash, Loader2, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  eliminarTodasVariables,
  indicesVariablesPlantilla,
  renumerarVariablesEnTexto,
  quitarVariableNumero,
  validarNombrePlantillaMeta,
  type CategoriaPlantillaMeta,
  type EncabezadoPlantillaForm,
  type FormCrearPlantillaMeta,
} from "@/lib/whatsapp-meta-template-payload";

const IDIOMAS: { value: string; label: string }[] = [
  { value: "es", label: "Español (es)" },
  { value: "es_AR", label: "Español Argentina" },
  { value: "en", label: "English" },
  { value: "en_US", label: "English (US)" },
  { value: "pt_BR", label: "Português (BR)" },
];

const CATEGORIAS: { id: CategoriaPlantillaMeta; titulo: string; desc: string }[] = [
  {
    id: "MARKETING",
    titulo: "Marketing",
    desc: "Difusiones y promos.",
  },
  {
    id: "UTILITY",
    titulo: "Utilidad",
    desc: "Transaccional tras una acción del usuario.",
  },
  {
    id: "AUTHENTICATION",
    titulo: "Autenticación",
    desc: "OTP; Meta puede exigir formato específico.",
  },
];

export type PlantillaDuplicarPayload = {
  nombreSugerido: string;
  idioma: string;
  categoria: CategoriaPlantillaMeta;
  encabezado: EncabezadoPlantillaForm;
  cuerpo: string;
  pie: string;
  boton: FormCrearPlantillaMeta["boton"];
};

type Props = {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onCreado: () => void;
  duplicarDe: PlantillaDuplicarPayload | null;
};

export function WhatsappMetaTemplateEditorDialog({
  abierto,
  onAbiertoChange,
  onCreado,
  duplicarDe,
}: Props) {
  const [nombre, setNombre] = useState("");
  const [idioma, setIdioma] = useState("es");
  const [categoria, setCategoria] = useState<CategoriaPlantillaMeta>("MARKETING");
  const [encabezado, setEncabezado] = useState<EncabezadoPlantillaForm>({ tipo: "none" });
  const [cuerpo, setCuerpo] = useState("");
  const [pie, setPie] = useState("");
  const [conBoton, setConBoton] = useState(false);
  const [botonTexto, setBotonTexto] = useState("");
  const [botonUrl, setBotonUrl] = useState("");
  const [botonEjemploUrl, setBotonEjemploUrl] = useState("");
  const [muestras, setMuestras] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [subiendoHeader, setSubiendoHeader] = useState(false);

  const boton: FormCrearPlantillaMeta["boton"] = useMemo(() => {
    if (!conBoton) return null;
    return { texto: botonTexto, url: botonUrl, ejemploUrl: botonEjemploUrl };
  }, [conBoton, botonTexto, botonUrl, botonEjemploUrl]);

  const formSinMuestras: Omit<FormCrearPlantillaMeta, "muestras"> = useMemo(
    () => ({
      nombre,
      idioma,
      categoria,
      encabezado,
      cuerpo,
      pie,
      boton,
    }),
    [nombre, idioma, categoria, encabezado, cuerpo, pie, boton],
  );

  const idsVariables = useMemo(
    () => indicesVariablesPlantilla(formSinMuestras),
    [formSinMuestras],
  );
  const idsKey = idsVariables.join(",");

  useEffect(() => {
    if (!abierto) return;
    setMuestras((prev) => {
      const next: Record<number, string> = {};
      for (const n of idsVariables) {
        next[n] = prev[n] ?? "";
      }
      return next;
    });
  }, [abierto, idsKey]);

  useEffect(() => {
    if (!abierto) return;
    if (duplicarDe) {
      setNombre(duplicarDe.nombreSugerido);
      setIdioma(duplicarDe.idioma);
      setCategoria(duplicarDe.categoria);
      setEncabezado(duplicarDe.encabezado);
      setCuerpo(duplicarDe.cuerpo);
      setPie(duplicarDe.pie);
      const b = duplicarDe.boton;
      if (b && b.texto.trim() && b.url.trim()) {
        setConBoton(true);
        setBotonTexto(b.texto);
        setBotonUrl(b.url);
        setBotonEjemploUrl(b.ejemploUrl);
      } else {
        setConBoton(false);
        setBotonTexto("");
        setBotonUrl("");
        setBotonEjemploUrl("");
      }
      setMuestras({});
    } else {
      setNombre("");
      setIdioma("es");
      setCategoria("MARKETING");
      setEncabezado({ tipo: "none" });
      setCuerpo("");
      setPie("");
      setConBoton(false);
      setBotonTexto("");
      setBotonUrl("");
      setBotonEjemploUrl("");
      setMuestras({});
    }
  }, [abierto, duplicarDe]);

  const enviar = async () => {
    const errNombre = validarNombrePlantillaMeta(nombre);
    if (errNombre) {
      toast.error(errNombre);
      return;
    }
    const payload: FormCrearPlantillaMeta = {
      nombre: nombre.trim(),
      idioma,
      categoria,
      encabezado,
      cuerpo,
      pie,
      boton,
      muestras,
    };
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: payload.nombre,
          idioma: payload.idioma,
          categoria: payload.categoria,
          encabezado: payload.encabezado,
          cuerpo: payload.cuerpo,
          pie: payload.pie,
          boton: payload.boton,
          muestras: payload.muestras,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; resultado?: { id: string } };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Plantilla enviada a Meta (suele quedar PENDING hasta aprobación).");
      onAbiertoChange(false);
      onCreado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear.");
    } finally {
      setEnviando(false);
    }
  };

  const agregarVariableAlCuerpo = () => {
    const siguiente = idsVariables.length > 0 ? Math.max(...idsVariables) + 1 : 1;
    setCuerpo((prev) => `${prev}{{${siguiente}}}`);
  };

  const aplicarRenumerarVariables = () => {
    setCuerpo((prev) => renumerarVariablesEnTexto(prev));
    if (conBoton) setBotonUrl((prev) => renumerarVariablesEnTexto(prev));
    setEncabezado((prev) =>
      prev.tipo === "text" ? { tipo: "text", texto: renumerarVariablesEnTexto(prev.texto) } : prev,
    );
  };

  const aplicarQuitarTodasVariables = () => {
    setCuerpo((prev) => eliminarTodasVariables(prev));
    if (conBoton) setBotonUrl((prev) => eliminarTodasVariables(prev));
    setEncabezado((prev) =>
      prev.tipo === "text" ? { tipo: "text", texto: eliminarTodasVariables(prev.texto) } : prev,
    );
  };

  const quitarVariableN = (n: number) => {
    setCuerpo((prev) => quitarVariableNumero(prev, n));
    if (conBoton) setBotonUrl((prev) => quitarVariableNumero(prev, n));
    setEncabezado((prev) =>
      prev.tipo === "text" ? { tipo: "text", texto: quitarVariableNumero(prev.texto, n) } : prev,
    );
  };

  const subirImagenHeader = async (archivo: File | null) => {
    if (!archivo) return;
    setSubiendoHeader(true);
    try {
      const fd = new FormData();
      fd.set("file", archivo);
      const res = await fetch("/api/admin/whatsapp/media/upload", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (!data.url) throw new Error("Sin URL pública.");
      setEncabezado({ tipo: "image", url: data.url });
      toast.success("Imagen subida; URL lista para Meta.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al subir.");
    } finally {
      setSubiendoHeader(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{duplicarDe ? "Nueva versión en Meta" : "Nueva plantilla en Meta"}</DialogTitle>
          <DialogDescription>
            {duplicarDe
              ? "Contenido copiado de la plantilla anterior: cambiá texto o nombre y enviá; Meta no permite editar la plantilla aprobada original in-place."
              : "Se crea vía Cloud API; Meta revisa antes de aprobar. Nombre único, sin mayúsculas ni espacios."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="wa-tpl-name">Nombre interno</Label>
              <Input
                id="wa-tpl-name"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="ej. aviso_despacho_1"
                autoComplete="off"
                maxLength={512}
              />
              <p className="text-xs text-muted-foreground">{nombre.trim().length}/512 · solo a-z 0-9 _</p>
            </div>
            <div className="space-y-1.5">
              <Label>Idioma</Label>
              <Select value={idioma} onValueChange={setIdioma}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IDIOMAS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categoría</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {CATEGORIAS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoria(c.id)}
                  className={cn(
                    "rounded-lg border p-3 text-left text-sm transition-colors",
                    categoria === c.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <p className="font-medium">{c.titulo}</p>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Encabezado (opcional)</Label>
            <Select
              value={encabezado.tipo}
              onValueChange={(v) => {
                if (v === "text") setEncabezado({ tipo: "text", texto: "" });
                else if (v === "image") setEncabezado({ tipo: "image", url: "" });
                else setEncabezado({ tipo: "none" });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguno</SelectItem>
                <SelectItem value="text">Texto (máx. 60)</SelectItem>
                <SelectItem value="image">Imagen (URL HTTPS pública)</SelectItem>
              </SelectContent>
            </Select>
            {encabezado.tipo === "text" ? (
              <Input
                value={encabezado.texto}
                onChange={(e) => setEncabezado({ tipo: "text", texto: e.target.value.slice(0, 60) })}
                placeholder="Título corto"
                maxLength={60}
              />
            ) : null}
            {encabezado.tipo === "image" ? (
              <div className="space-y-2">
                <Input
                  value={encabezado.url}
                  onChange={(e) => setEncabezado({ tipo: "image", url: e.target.value.slice(0, 2000) })}
                  placeholder="https://… (Meta debe poder descargarla)"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={subiendoHeader}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/jpeg,image/png,image/webp,image/gif";
                      input.onchange = () => {
                        const f = input.files?.[0];
                        void subirImagenHeader(f ?? null);
                      };
                      input.click();
                    }}
                  >
                    {subiendoHeader ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    Subir imagen
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Bucket público <code className="rounded bg-muted px-1">whatsapp-media</code> (SQL en repo).
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="wa-tpl-body">Cuerpo *</Label>
              <div className="flex flex-wrap gap-1">
                <Button type="button" variant="outline" size="sm" onClick={agregarVariableAlCuerpo}>
                  <Plus className="size-3.5" /> Variable
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={aplicarRenumerarVariables}>
                  <Hash className="size-3.5" /> Renumerar {"{{n}}"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={aplicarQuitarTodasVariables}>
                  <Trash2 className="size-3.5" /> Quitar todas
                </Button>
              </div>
            </div>
            {idsVariables.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {idsVariables.map((n) => (
                  <Button key={n} type="button" variant="secondary" size="sm" onClick={() => quitarVariableN(n)}>
                    Quitar {"{{"}
                    {n}
                    {"}}"}
                  </Button>
                ))}
              </div>
            ) : null}
            <Textarea
              id="wa-tpl-body"
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value.slice(0, 1024))}
              rows={6}
              placeholder="Usá {{1}}, {{2}}… para datos dinámicos. *negrita* con asteriscos."
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{cuerpo.length}/1024</p>
          </div>

          {idsVariables.length > 0 ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-sm font-medium">Ejemplos para variables (Meta)</p>
              <p className="text-xs text-muted-foreground">
                Completá cada una; Meta las usa al revisar la plantilla.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {idsVariables.map((n) => (
                  <div key={n} className="space-y-1">
                    <Label className="text-xs">{`{{${n}}}`}</Label>
                    <Input
                      value={muestras[n] ?? ""}
                      onChange={(e) => setMuestras((m) => ({ ...m, [n]: e.target.value }))}
                      placeholder={`Ejemplo ${n}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="wa-tpl-foot">Pie (opcional, sin variables)</Label>
            <Input
              id="wa-tpl-foot"
              value={pie}
              onChange={(e) => setPie(e.target.value.slice(0, 60))}
              maxLength={60}
              placeholder="Texto fijo abajo del mensaje"
            />
            <p className="text-xs text-muted-foreground">{pie.length}/60</p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="wa-tpl-btn"
              checked={conBoton}
              onCheckedChange={(c) => setConBoton(c === true)}
            />
            <Label htmlFor="wa-tpl-btn" className="font-normal">
              Botón «Visitar sitio»
            </Label>
          </div>
          {conBoton ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="space-y-1.5">
                <Label>Texto del botón (máx. 25)</Label>
                <Input
                  value={botonTexto}
                  onChange={(e) => setBotonTexto(e.target.value.slice(0, 25))}
                  maxLength={25}
                />
              </div>
              <div className="space-y-1.5">
                <Label>URL</Label>
                <Input
                  value={botonUrl}
                  onChange={(e) => setBotonUrl(e.target.value.slice(0, 2000))}
                  placeholder="https://… o con {{1}}"
                />
              </div>
              <div className="space-y-1.5">
                <Label>URL de ejemplo (obligatorio si la URL tiene variables)</Label>
                <Input
                  value={botonEjemploUrl}
                  onChange={(e) => setBotonEjemploUrl(e.target.value.slice(0, 2000))}
                  placeholder="Link completo de muestra"
                />
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void enviar()} disabled={enviando}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : null}
            Enviar a Meta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
