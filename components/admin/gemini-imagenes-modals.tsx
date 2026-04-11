"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Download, ImageIcon, Loader2, Sparkles, Upload, Wand2 } from "lucide-react";

import { geminiGenerarImagenDesdeReferencia } from "@/app/(admin)/actions/geminiImagenes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  enmascararClave,
  guardarGeminiKeyEnLocal,
  leerGeminiKeyDesdeLocal,
} from "@/lib/carga-magica-widget-storage";
import {
  PROMPT_IMAGEN_GALERIA_GEMINI_DEFAULT,
  PROMPT_IMAGEN_PRODUCTO_GEMINI_DEFAULT,
} from "@/lib/gemini-imagen-prompts";
import { cn } from "@/lib/utils";

function slugParaNombreArchivo(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 120) || "producto";
}

function extensionDesdeMime(mime: string): string {
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "png";
}

function descargarBase64(b64: string, mime: string, nombreArchivo: string) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

function ZonaImagen(props: {
  etiqueta: string;
  archivo: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onArchivo: (f: File | null) => void;
  disabled?: boolean;
}) {
  const { etiqueta, archivo, inputRef, onArchivo, disabled } = props;
  const [arrastrando, setArrastrando] = useState(false);

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">{etiqueta}</Label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setArrastrando(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (disabled) return;
          const f = e.dataTransfer.files?.[0];
          onArchivo(f && f.type.startsWith("image/") ? f : null);
        }}
        className={cn(
          "flex min-h-[100px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors",
          arrastrando
            ? "border-primary bg-primary/10"
            : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50 dark:bg-muted/15",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled}
          onChange={(e) => onArchivo(e.target.files?.[0] ?? null)}
        />
        <Upload className="size-5 text-primary" aria-hidden />
        <p className="text-xs text-muted-foreground">
          {archivo ? (
            <span className="font-medium text-foreground">{archivo.name}</span>
          ) : (
            "Arrastrá o tocá para elegir imagen"
          )}
        </p>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
          <ImageIcon className="size-3.5 text-primary" aria-hidden />
          PNG / JPG / WebP
        </span>
      </button>
    </div>
  );
}

export function GeminiImagenesModals() {
  const refProducto = useRef<HTMLInputElement>(null);
  const refGaleria = useRef<HTMLInputElement>(null);

  const [draftGemini, setDraftGemini] = useState("");
  const [claveGemini, setClaveGemini] = useState("");

  const [modalProducto, setModalProducto] = useState(false);
  const [modalGaleria, setModalGaleria] = useState(false);

  const [imgProducto, setImgProducto] = useState<File | null>(null);
  const [imgGaleria, setImgGaleria] = useState<File | null>(null);

  const [slugProducto, setSlugProducto] = useState("");
  const [promptProducto, setPromptProducto] = useState(PROMPT_IMAGEN_PRODUCTO_GEMINI_DEFAULT);
  const [promptGaleria, setPromptGaleria] = useState(PROMPT_IMAGEN_GALERIA_GEMINI_DEFAULT);

  const [cantidadGaleria, setCantidadGaleria] = useState("3");
  const [ratioGaleria, setRatioGaleria] = useState("4:5");
  const [slugGaleria, setSlugGaleria] = useState("");

  const [errProducto, setErrProducto] = useState<string | null>(null);
  const [errGaleria, setErrGaleria] = useState<string | null>(null);
  const [progresoGaleria, setProgresoGaleria] = useState<string | null>(null);

  const [pendingProducto, startProducto] = useTransition();
  const [pendingGaleria, startGaleria] = useTransition();

  useEffect(() => {
    setClaveGemini(leerGeminiKeyDesdeLocal());
    setDraftGemini(leerGeminiKeyDesdeLocal());
  }, []);

  const apiKeyEfectiva = claveGemini.trim();

  const guardarClaveGemini = useCallback(() => {
    const v = draftGemini.trim();
    guardarGeminiKeyEnLocal(v);
    setClaveGemini(v);
  }, [draftGemini]);

  const armarFormBase = useCallback(
    (imagen: File, prompt: string, aspectRatio: string, imageSize: string) => {
      const fd = new FormData();
      fd.set("imagen", imagen);
      fd.set("prompt", prompt);
      fd.set("aspect_ratio", aspectRatio);
      fd.set("image_size", imageSize);
      if (apiKeyEfectiva) fd.set("gemini_api_key", apiKeyEfectiva);
      return fd;
    },
    [apiKeyEfectiva],
  );

  const generarProducto = useCallback(() => {
    setErrProducto(null);
    if (!imgProducto) {
      setErrProducto("Subí la imagen del producto.");
      return;
    }
    const slug = slugParaNombreArchivo(slugProducto);
    startProducto(() => {
      void (async () => {
        const fd = armarFormBase(imgProducto, promptProducto, "1:1", "2K");
        const res = await geminiGenerarImagenDesdeReferencia(fd);
        if (!res.ok) {
          setErrProducto(res.error);
          return;
        }
        const ext = extensionDesdeMime(res.mime_type);
        descargarBase64(res.imagen_base64, res.mime_type, `${slug}.${ext}`);
      })();
    });
  }, [armarFormBase, imgProducto, promptProducto, slugProducto]);

  const generarGaleria = useCallback(() => {
    setErrGaleria(null);
    setProgresoGaleria(null);
    if (!imgGaleria) {
      setErrGaleria("Subí la imagen de referencia del producto.");
      return;
    }
    const n = Math.min(5, Math.max(1, Math.floor(Number(cantidadGaleria)) || 1));
    const baseSlug = slugParaNombreArchivo(slugGaleria || slugProducto || "galeria");

    startGaleria(() => {
      void (async () => {
        for (let i = 1; i <= n; i += 1) {
          setProgresoGaleria(`Generando imagen ${i} de ${n}…`);
          const variacion =
            n > 1
              ? `${promptGaleria}\n\n(Variación ${i} de ${n}: composición, ángulo o escena distinta a las anteriores; misma fidelidad al producto.)`
              : promptGaleria;
          const fd = armarFormBase(imgGaleria, variacion, ratioGaleria, "2K");
          const res = await geminiGenerarImagenDesdeReferencia(fd);
          if (!res.ok) {
            setErrGaleria(res.error);
            setProgresoGaleria(null);
            return;
          }
          const ext = extensionDesdeMime(res.mime_type);
          descargarBase64(res.imagen_base64, res.mime_type, `${baseSlug}-galeria-${i}.${ext}`);
        }
        setProgresoGaleria("Listo. Revisá las descargas del navegador.");
      })();
    });
  }, [armarFormBase, cantidadGaleria, imgGaleria, promptGaleria, ratioGaleria, slugGaleria, slugProducto]);

  return (
    <>
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Wand2 className="size-4 text-primary" aria-hidden />
            <CardTitle className="text-base">Imágenes con Gemini 3.1 Flash Image</CardTitle>
          </div>
          <CardDescription>
            Packshot fondo blanco (desde foto de referencia) y escenas hiperrealistas para galería. Modelo{" "}
            <span className="font-mono text-foreground">gemini-3.1-flash-image-preview</span>. La clave puede ir en{" "}
            <span className="font-mono text-foreground">GEMINI_API_KEY</span> (servidor) o guardada abajo en este
            navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 dark:bg-muted/15">
            <Label htmlFor="gemini_api_draft" className="text-xs font-medium text-muted-foreground">
              Google AI API key
            </Label>
            <Input
              id="gemini_api_draft"
              type="password"
              autoComplete="off"
              placeholder="Pegá la clave de AI Studio…"
              value={draftGemini}
              onChange={(e) => setDraftGemini(e.target.value)}
              className="mt-2 h-10 border-border bg-background font-mono text-sm"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={guardarClaveGemini} disabled={!draftGemini.trim()}>
                Guardar en este navegador
              </Button>
            </div>
            {claveGemini ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Clave guardada: <span className="font-mono text-foreground">{enmascararClave(claveGemini)}</span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Sin clave en el navegador: se usará solo <span className="font-mono">GEMINI_API_KEY</span> del servidor
                si existe.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="default"
              className="gap-2"
              onClick={() => {
                setModalProducto(true);
                setErrProducto(null);
              }}
            >
              <Sparkles className="size-4 shrink-0" aria-hidden />
              Imagen de producto (fondo blanco)
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-border"
              onClick={() => {
                setModalGaleria(true);
                setErrGaleria(null);
                setProgresoGaleria(null);
              }}
            >
              <ImageIcon className="size-4 shrink-0 text-primary" aria-hidden />
              Imágenes de galería (escena / en uso)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalProducto} onOpenChange={setModalProducto}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Imagen principal — packshot</DialogTitle>
            <DialogDescription>
              Referencia del producto + prompt editable. Se genera 1:1 en calidad 2K; el archivo se descarga con el
              nombre del slug (URL) que indiques.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ZonaImagen
              etiqueta="Imagen de referencia"
              archivo={imgProducto}
              inputRef={refProducto}
              onArchivo={setImgProducto}
              disabled={pendingProducto}
            />
            <div className="space-y-2">
              <Label htmlFor="slug_producto_gemini" className="text-xs font-medium text-muted-foreground">
                Nombre del archivo (slug del producto)
              </Label>
              <Input
                id="slug_producto_gemini"
                placeholder="ej. chicles-cliss-hortela"
                value={slugProducto}
                onChange={(e) => setSlugProducto(e.target.value)}
                disabled={pendingProducto}
                className="h-10 border-border bg-background font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt_producto_gemini" className="text-xs font-medium text-muted-foreground">
                Prompt
              </Label>
              <Textarea
                id="prompt_producto_gemini"
                value={promptProducto}
                onChange={(e) => setPromptProducto(e.target.value)}
                disabled={pendingProducto}
                rows={12}
                className="resize-y border-border bg-background text-sm"
              />
            </div>
            {errProducto ? (
              <p className="text-sm text-destructive" role="alert">
                {errProducto}
              </p>
            ) : null}
            <Button
              type="button"
              className="w-full gap-2"
              disabled={pendingProducto}
              onClick={generarProducto}
            >
              {pendingProducto ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              <Download className="size-4 shrink-0" aria-hidden />
              Generar y descargar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modalGaleria} onOpenChange={setModalGaleria}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Galería — escenas hiperrealistas</DialogTitle>
            <DialogDescription>
              Una o varias imágenes a partir de la misma referencia. Cada una se descarga como{" "}
              <span className="font-mono text-foreground">slug-galeria-1.png</span>, etc.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ZonaImagen
              etiqueta="Imagen de referencia del producto"
              archivo={imgGaleria}
              inputRef={refGaleria}
              onArchivo={setImgGaleria}
              disabled={pendingGaleria}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Cantidad</Label>
                <Select value={cantidadGaleria} onValueChange={setCantidadGaleria} disabled={pendingGaleria}>
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 imagen</SelectItem>
                    <SelectItem value="2">2 imágenes</SelectItem>
                    <SelectItem value="3">3 imágenes</SelectItem>
                    <SelectItem value="4">4 imágenes</SelectItem>
                    <SelectItem value="5">5 imágenes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Relación de aspecto</Label>
                <Select value={ratioGaleria} onValueChange={setRatioGaleria} disabled={pendingGaleria}>
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1:1">1:1</SelectItem>
                    <SelectItem value="4:5">4:5 (vertical tienda)</SelectItem>
                    <SelectItem value="3:4">3:4</SelectItem>
                    <SelectItem value="4:3">4:3</SelectItem>
                    <SelectItem value="16:9">16:9</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug_galeria_gemini" className="text-xs font-medium text-muted-foreground">
                Prefijo del nombre de archivo (slug)
              </Label>
              <Input
                id="slug_galeria_gemini"
                placeholder="ej. chicles-cliss-hortela"
                value={slugGaleria}
                onChange={(e) => setSlugGaleria(e.target.value)}
                disabled={pendingGaleria}
                className="h-10 border-border bg-background font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt_galeria_gemini" className="text-xs font-medium text-muted-foreground">
                Prompt
              </Label>
              <Textarea
                id="prompt_galeria_gemini"
                value={promptGaleria}
                onChange={(e) => setPromptGaleria(e.target.value)}
                disabled={pendingGaleria}
                rows={10}
                className="resize-y border-border bg-background text-sm"
              />
            </div>
            {errGaleria ? (
              <p className="text-sm text-destructive" role="alert">
                {errGaleria}
              </p>
            ) : null}
            {progresoGaleria ? (
              <p className="text-xs text-muted-foreground" role="status">
                {progresoGaleria}
              </p>
            ) : null}
            <Button type="button" className="w-full gap-2" disabled={pendingGaleria} onClick={generarGaleria}>
              {pendingGaleria ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              <Download className="size-4 shrink-0" aria-hidden />
              Generar y descargar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
