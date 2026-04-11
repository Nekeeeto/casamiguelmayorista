"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  DollarSign,
  ExternalLink,
  ImageIcon,
  KeyRound,
  FileStack,
  ListOrdered,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import {
  crearProductoWooDesdeFicha,
  extraerFichaProductoPorScreenshot,
  listarBorradoresWooMagico,
  procesarProductoPorScreenshot,
  publicarBorradorWooMagico,
} from "@/app/(admin)/actions/cargaMagica";
import type {
  BorradorWooListadoItem,
  FichaProductoCargaMagica,
  ResultadoCrearWooDesdeFicha,
  ResultadoExtraerFichaProducto,
  ResultadoProcesarProductoPorScreenshot,
} from "@/app/(admin)/actions/cargaMagica";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  borrarClavesWidgetLocal,
  calcularCostosEstimadosUsd,
  enmascararClave,
  guardarClavesWidgetEnLocal,
  guardarLogCostosEnLocal,
  guardarModeloAnthropicEnLocal,
  guardarOmitirPhotoroomEnLocal,
  guardarPromptSistemaEnLocal,
  guardarTarifasEnLocal,
  leerClavesWidgetDesdeLocal,
  leerOmitirPhotoroomDesdeLocal,
  leerLogCostosDesdeLocal,
  leerModeloAnthropicGuardado,
  leerPromptSistemaGuardado,
  leerTarifasDesdeLocal,
  MODELO_CLAUDE_DEFAULT,
  MODELOS_CLAUDE_VISION,
  type EntradaLogCostoCargaMagica,
  type TarifasCargaMagica,
} from "@/lib/carga-magica-widget-storage";
import { cn } from "@/lib/utils";

/** Quita prefijos tipo `0.`, `1.`, `2b.`, `10.` para que el `<ol>` lleve la numeración (atributo `start`). */
function textoPasoSinNumeracionAutomatica(linea: string) {
  const t = linea.trimStart();
  const sinReloj = t.startsWith("⏳") ? t.replace(/^⏳\s*/, "").trim() : t;
  return sinReloj.replace(/^\d+[a-z]*\s*[.)]\s*/i, "").trim() || linea;
}

function ListaPasosNumerados(props: { titulo: string; lineas: string[]; startAt?: number }) {
  const { titulo, lineas, startAt } = props;
  if (lineas.length === 0) return null;
  const inicio = Math.max(1, Math.floor(startAt ?? 1));
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <ol
        start={inicio}
        className="ml-1 list-decimal space-y-2 pl-5 text-sm text-foreground marker:font-medium marker:text-muted-foreground"
      >
        {lineas.map((linea, i) => (
          <li
            key={`${titulo}-${inicio + i}-${linea.slice(0, 24)}`}
            className={cn(
              "pl-1",
              linea.includes("✖") || linea.toLowerCase().includes("error:")
                ? "text-destructive marker:text-destructive"
                : null,
              linea.includes("⚠") ? "text-amber-800 dark:text-amber-400 marker:text-amber-700 dark:marker:text-amber-500" : null,
              linea.startsWith("⏳") ? "text-muted-foreground" : null,
            )}
          >
            <span className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
              {textoPasoSinNumeracionAutomatica(linea)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ZonaDropArchivo(props: {
  etiqueta: string;
  descripcion: string;
  archivo: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSeleccion: (archivo: File | null) => void;
  disabled?: boolean;
}) {
  const { etiqueta, descripcion, archivo, inputRef, onSeleccion, disabled } = props;
  const [arrastrando, setArrastrando] = useState(false);

  const abrirSelector = () => {
    if (!disabled) inputRef.current?.click();
  };

  const manejarArchivo = (lista: FileList | null) => {
    const primero = lista?.[0];
    onSeleccion(primero ?? null);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">{etiqueta}</Label>
      <button
        type="button"
        disabled={disabled}
        onClick={abrirSelector}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setArrastrando(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (disabled) return;
          manejarArchivo(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
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
          onChange={(e) => manejarArchivo(e.target.files)}
        />
        <div
          className={cn(
            "flex size-11 items-center justify-center rounded-full border border-border bg-background",
            arrastrando && "border-primary bg-primary/10",
          )}
        >
          <Upload className="size-5 text-primary" aria-hidden />
        </div>
        <p className="text-xs text-muted-foreground">{descripcion}</p>
        {archivo ? (
          <p className="max-w-full truncate text-xs font-medium text-foreground">{archivo.name}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">Arrastrá acá o tocá para elegir archivo</p>
        )}
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
          <ImageIcon className="size-3.5 text-primary" aria-hidden />
          PNG / JPG / WebP
        </span>
      </button>
    </div>
  );
}

type FilaMasiva = {
  id: string;
  screenshot: File | null;
  precio: string;
  sku: string;
  imagenWoo: File | null;
  estado: "pendiente" | "extraendo" | "extraido" | "error" | "woo_ok" | "woo_error";
  ficha?: FichaProductoCargaMagica;
  errorMsg?: string;
  wooUrl?: string;
  seleccionado: boolean;
};

export function CargaMagicaScreenshotPanel() {
  const [pending, startTransition] = useTransition();
  const [pendingMasivo, startMasivo] = useTransition();
  const refFoto = useRef<HTMLInputElement>(null);
  const refShot = useRef<HTMLInputElement>(null);
  const refImagenManual = useRef<HTMLInputElement>(null);
  const refMultiShot = useRef<HTMLInputElement>(null);

  const [fotoCruda, setFotoCruda] = useState<File | null>(null);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [imagenManualWoo, setImagenManualWoo] = useState<File | null>(null);
  const [aprobacionManual, setAprobacionManual] = useState(true);
  /** Por defecto omitimos Photoroom (no bloquea si el plan venció). Se persiste en localStorage. */
  const [omitirPhotoroom, setOmitirPhotoroom] = useState(true);

  const [lineasConsola, setLineasConsola] = useState<string[]>([]);
  const [resultado, setResultado] = useState<ResultadoProcesarProductoPorScreenshot | null>(null);
  const [ultimoCostoCarga, setUltimoCostoCarga] = useState<EntradaLogCostoCargaMagica | null>(null);

  const [fichaExtraida, setFichaExtraida] = useState<FichaProductoCargaMagica | null>(null);
  const [pasosExtraccion, setPasosExtraccion] = useState<string[]>([]);
  const [resumenCatsExtraccion, setResumenCatsExtraccion] = useState<{
    aplicadas?: string[];
    advertencia?: string | null;
  } | null>(null);

  const [modalBorradoresAbierto, setModalBorradoresAbierto] = useState(false);
  const [itemsBorradoresWoo, setItemsBorradoresWoo] = useState<BorradorWooListadoItem[]>([]);
  const [cargandoListaBorradores, setCargandoListaBorradores] = useState(false);
  const [errorModalBorradores, setErrorModalBorradores] = useState<string | null>(null);
  const [publicandoBorradorId, setPublicandoBorradorId] = useState<number | null>(null);

  const [draftPhotoroom, setDraftPhotoroom] = useState("");
  const [draftAnthropic, setDraftAnthropic] = useState("");
  const [clavePhotoroom, setClavePhotoroom] = useState("");
  const [claveAnthropic, setClaveAnthropic] = useState("");

  const [promptSistema, setPromptSistema] = useState("");
  const [modeloAnthropic, setModeloAnthropic] = useState(MODELO_CLAUDE_DEFAULT);

  const [tarifas, setTarifas] = useState<TarifasCargaMagica>(() => ({ ...leerTarifasDesdeLocal() }));
  const [tarifaInputStr, setTarifaInputStr] = useState("");
  const [tarifaOutputStr, setTarifaOutputStr] = useState("");
  const [tarifaPhotoStr, setTarifaPhotoStr] = useState("");

  const [logCostos, setLogCostos] = useState<EntradaLogCostoCargaMagica[]>([]);

  const [filasMasivas, setFilasMasivas] = useState<FilaMasiva[]>([]);
  const [defaultPrecioMasivo, setDefaultPrecioMasivo] = useState("149");

  useEffect(() => {
    setOmitirPhotoroom(leerOmitirPhotoroomDesdeLocal());
    const { photoroom, anthropic } = leerClavesWidgetDesdeLocal();
    setClavePhotoroom(photoroom);
    setClaveAnthropic(anthropic);
    setDraftPhotoroom(photoroom);
    setDraftAnthropic(anthropic);
    const t = leerTarifasDesdeLocal();
    setTarifas(t);
    setTarifaInputStr(String(t.usdPorMillonInput));
    setTarifaOutputStr(String(t.usdPorMillonOutput));
    setTarifaPhotoStr(String(t.usdPorImagenPhotoroom));
    setLogCostos(leerLogCostosDesdeLocal());
    const guardadoModelo = leerModeloAnthropicGuardado();
    if (guardadoModelo) setModeloAnthropic(guardadoModelo);
    const guardadoPrompt = leerPromptSistemaGuardado();
    if (guardadoPrompt) {
      setPromptSistema(guardadoPrompt);
    } else {
      void import("@/lib/carga-magica-sistema-prompt").then((m) => {
        setPromptSistema((prev) => (prev.trim() ? prev : m.PROMPT_SISTEMA_CARGA_MAGICA));
      });
    }
  }, []);

  const conectadaAnthropic = Boolean(claveAnthropic.trim());
  const photoroomConfigurada = Boolean(clavePhotoroom.trim());
  const puedeProcesar = conectadaAnthropic && (omitirPhotoroom || photoroomConfigurada);

  const filasMasivasRef = useRef(filasMasivas);
  filasMasivasRef.current = filasMasivas;

  const totalesCostos = useMemo(() => {
    let ok = 0;
    let usdPh = 0;
    let usdAn = 0;
    let usdTot = 0;
    for (const e of logCostos) {
      if (!e.ok) continue;
      ok += 1;
      usdPh += e.usd_photoroom;
      usdAn += e.usd_anthropic;
      usdTot += e.usd_total;
    }
    return {
      cargasOk: ok,
      usdPhotoroom: Number(usdPh.toFixed(4)),
      usdAnthropic: Number(usdAn.toFixed(4)),
      usdTotal: Number(usdTot.toFixed(4)),
    };
  }, [logCostos]);

  const registrarCosto = useCallback(
    (args: {
      titulo_seo?: string;
      photoroomLlamadas: number;
      anthropicInputTokens: number;
      anthropicOutputTokens: number;
    }) => {
      const costos = calcularCostosEstimadosUsd({
        tarifas,
        photoroomLlamadas: args.photoroomLlamadas,
        anthropicInputTokens: args.anthropicInputTokens,
        anthropicOutputTokens: args.anthropicOutputTokens,
      });
      const entrada: EntradaLogCostoCargaMagica = {
        ts: new Date().toISOString(),
        ok: true,
        titulo_seo: args.titulo_seo,
        photoroom_llamadas: args.photoroomLlamadas,
        anthropic_input_tokens: args.anthropicInputTokens,
        anthropic_output_tokens: args.anthropicOutputTokens,
        usd_photoroom: costos.usd_photoroom,
        usd_anthropic: costos.usd_anthropic,
        usd_total: costos.usd_total,
      };
      setUltimoCostoCarga(entrada);
      const prevLog = leerLogCostosDesdeLocal();
      guardarLogCostosEnLocal([...prevLog, entrada]);
      setLogCostos([...prevLog, entrada]);
    },
    [tarifas],
  );

  const guardarConexion = useCallback(() => {
    const a = draftAnthropic.trim();
    if (!a) return;
    guardarClavesWidgetEnLocal(draftPhotoroom.trim(), a);
    setClavePhotoroom(draftPhotoroom.trim());
    setClaveAnthropic(a);
  }, [draftPhotoroom, draftAnthropic]);

  const desconectar = useCallback(() => {
    borrarClavesWidgetLocal();
    setClavePhotoroom("");
    setClaveAnthropic("");
    setDraftPhotoroom("");
    setDraftAnthropic("");
  }, []);

  const guardarTarifasClick = useCallback(() => {
    const next: TarifasCargaMagica = {
      usdPorMillonInput: Math.max(0, Number.parseFloat(tarifaInputStr.replace(",", ".")) || 0),
      usdPorMillonOutput: Math.max(0, Number.parseFloat(tarifaOutputStr.replace(",", ".")) || 0),
      usdPorImagenPhotoroom: Math.max(0, Number.parseFloat(tarifaPhotoStr.replace(",", ".")) || 0),
    };
    setTarifas(next);
    guardarTarifasEnLocal(next);
  }, [tarifaInputStr, tarifaOutputStr, tarifaPhotoStr]);

  const limpiarHistorialCostos = useCallback(() => {
    guardarLogCostosEnLocal([]);
    setLogCostos([]);
    setUltimoCostoCarga(null);
  }, []);

  const cargarListaBorradoresWoo = useCallback(() => {
    setErrorModalBorradores(null);
    setCargandoListaBorradores(true);
    void (async () => {
      const res = await listarBorradoresWooMagico();
      setCargandoListaBorradores(false);
      if (res.ok) {
        setItemsBorradoresWoo(res.items);
      } else {
        setItemsBorradoresWoo([]);
        setErrorModalBorradores(res.error);
      }
    })();
  }, []);

  const abrirModalBorradores = useCallback(() => {
    setModalBorradoresAbierto(true);
    cargarListaBorradoresWoo();
  }, [cargarListaBorradoresWoo]);

  const publicarBorradorDesdeModal = useCallback(async (id: number) => {
    setErrorModalBorradores(null);
    setPublicandoBorradorId(id);
    const fd = new FormData();
    fd.set("woo_product_id", String(id));
    const res = await publicarBorradorWooMagico(fd);
    setPublicandoBorradorId(null);
    if (!res.ok) {
      setErrorModalBorradores(res.error);
      return;
    }
    setItemsBorradoresWoo((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const restaurarPromptDefault = useCallback(() => {
    void import("@/lib/carga-magica-sistema-prompt").then((m) => {
      setPromptSistema(m.PROMPT_SISTEMA_CARGA_MAGICA);
    });
  }, []);

  const guardarPromptLocal = useCallback(() => {
    guardarPromptSistemaEnLocal(promptSistema);
  }, [promptSistema]);

  const appendFormClaudeBase = useCallback(
    (fd: FormData) => {
      fd.set("anthropic_api_key", claveAnthropic.trim());
      fd.set("photoroom_api_key", clavePhotoroom.trim());
      fd.set("omitir_photoroom", omitirPhotoroom ? "true" : "false");
      fd.set("prompt_sistema_claude", promptSistema.trim());
      fd.set("anthropic_model", modeloAnthropic);
    },
    [claveAnthropic, clavePhotoroom, omitirPhotoroom, promptSistema, modeloAnthropic],
  );

  const alExtraerSoloDatos = useCallback(() => {
    if (!conectadaAnthropic) return;
    if (!screenshot) {
      setPasosExtraccion(["Subí la screenshot del proveedor."]);
      return;
    }
    const precioInput = document.getElementById("precio_venta") as HTMLInputElement | null;
    const skuInput = document.getElementById("nombre_base_sku") as HTMLInputElement | null;
    const precioVenta = precioInput?.value?.trim() ?? "";
    const nombreBaseSku = skuInput?.value?.trim() ?? "";
    if (!precioVenta) {
      setPasosExtraccion(["Indicá el precio de venta."]);
      return;
    }

    setResultado(null);
    setFichaExtraida(null);
    setResumenCatsExtraccion(null);
    setPasosExtraccion(["⏳ Extrayendo con Claude…"]);

    const fd = new FormData();
    appendFormClaudeBase(fd);
    fd.set("nombre_base_sku", nombreBaseSku);
    fd.set("precio_venta", precioVenta);
    fd.set("screenshot", screenshot);

    startTransition(() => {
      void (async () => {
        const res: ResultadoExtraerFichaProducto = await extraerFichaProductoPorScreenshot(fd);
        setPasosExtraccion((prev) => [...prev.filter((l) => !l.startsWith("⏳")), ...res.pasos]);
        if (res.ok) {
          setFichaExtraida(res.ficha);
          setResumenCatsExtraccion({
            aplicadas: res.categorias_aplicadas,
            advertencia: res.categoria_advertencia ?? null,
          });
          registrarCosto({
            titulo_seo: res.ficha.titulo_seo,
            photoroomLlamadas: res.uso_apis.photoroom_llamadas,
            anthropicInputTokens: res.uso_apis.anthropic_input_tokens,
            anthropicOutputTokens: res.uso_apis.anthropic_output_tokens,
          });
        } else {
          setFichaExtraida(null);
          setResumenCatsExtraccion(null);
        }
      })();
    });
  }, [appendFormClaudeBase, conectadaAnthropic, registrarCosto, screenshot]);

  const alCrearWooDesdeFichaGuardada = useCallback(() => {
    if (!fichaExtraida || !conectadaAnthropic) return;
    const precioInput = document.getElementById("precio_venta") as HTMLInputElement | null;
    const skuInput = document.getElementById("nombre_base_sku") as HTMLInputElement | null;
    const precioVenta = precioInput?.value?.trim() ?? "";
    const nombreBaseSku = skuInput?.value?.trim() ?? "";
    if (!precioVenta) return;

    setResultado(null);
    setLineasConsola(["⏳ Creando en WooCommerce…"]);

    const fd = new FormData();
    fd.set("ficha_json", JSON.stringify(fichaExtraida));
    fd.set("precio_venta", precioVenta);
    fd.set("nombre_base_sku", nombreBaseSku);
    fd.set("aprobacion_manual", aprobacionManual ? "true" : "false");
    if (imagenManualWoo) fd.set("imagen_principal_woo", imagenManualWoo);

    startTransition(() => {
      void (async () => {
        const res: ResultadoCrearWooDesdeFicha = await crearProductoWooDesdeFicha(fd);
        setLineasConsola((prev) => [...prev.filter((l) => !l.startsWith("⏳")), ...res.pasos]);
        if (res.ok) {
          setResultado({
            ok: true,
            pasos: res.pasos,
            modo: res.modo,
            woo_product_id: res.woo_product_id,
            titulo_seo: res.titulo_seo,
            prompt_foto_2: res.prompt_foto_2,
            url_revision_woo: res.url_revision_woo,
            uso_apis: {
              photoroom_llamadas: 0,
              anthropic_input_tokens: 0,
              anthropic_output_tokens: 0,
            },
            categorias_aplicadas: res.categorias_aplicadas,
            categoria_advertencia: res.categoria_advertencia,
          });
        } else {
          setResultado({ ok: false, pasos: res.pasos, error: res.error });
        }
      })();
    });
  }, [aprobacionManual, conectadaAnthropic, fichaExtraida, imagenManualWoo]);

  const alSubmitCompleto = useCallback(
    (evento: React.FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      if (!puedeProcesar) {
        setResultado({
          ok: false,
          pasos: [],
          error: omitirPhotoroom
            ? "Conectá Anthropic. Con Photoroom omitido no hace falta clave Photoroom."
            : "Conectá Anthropic y Photoroom, u omití Photoroom.",
        });
        return;
      }
      if (!omitirPhotoroom && !fotoCruda) {
        setResultado({
          ok: false,
          pasos: [],
          error: "Con Photoroom activo tenés que subir la foto cruda, o activá Omitir Photoroom.",
        });
        return;
      }

      setResultado(null);
      setUltimoCostoCarga(null);
      setFichaExtraida(null);
      setResumenCatsExtraccion(null);
      setLineasConsola([
        "⏳ Iniciando…",
        omitirPhotoroom
          ? "1. Photoroom omitido — Claude → WooCommerce"
          : "1. Cola: Photoroom → Claude → WooCommerce",
      ]);

      const fd = new FormData(evento.currentTarget);
      fd.set("aprobacion_manual", aprobacionManual ? "true" : "false");
      appendFormClaudeBase(fd);
      if (fotoCruda) fd.set("foto_cruda", fotoCruda);
      if (screenshot) fd.set("screenshot", screenshot);
      if (imagenManualWoo) fd.set("imagen_principal_woo", imagenManualWoo);

      startTransition(() => {
        void (async () => {
          const res = await procesarProductoPorScreenshot(fd);
          setResultado(res);
          setLineasConsola((prev) => [...prev.filter((l) => !l.startsWith("⏳")), ...res.pasos]);

          if (res.ok) {
            registrarCosto({
              titulo_seo: res.titulo_seo,
              photoroomLlamadas: res.uso_apis.photoroom_llamadas,
              anthropicInputTokens: res.uso_apis.anthropic_input_tokens,
              anthropicOutputTokens: res.uso_apis.anthropic_output_tokens,
            });
          }
        })();
      });
    },
    [
      aprobacionManual,
      appendFormClaudeBase,
      fotoCruda,
      imagenManualWoo,
      omitirPhotoroom,
      puedeProcesar,
      registrarCosto,
      screenshot,
    ],
  );

  const agregarFilaMasiva = useCallback(() => {
    setFilasMasivas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        screenshot: null,
        precio: defaultPrecioMasivo,
        sku: "",
        imagenWoo: null,
        estado: "pendiente",
        seleccionado: true,
      },
    ]);
  }, [defaultPrecioMasivo]);

  const onMultiScreenshots = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const lista = e.target.files;
      if (!lista?.length) return;
      setFilasMasivas((prev) => {
        const nuevas = [...prev];
        for (const f of Array.from(lista)) {
          nuevas.push({
            id: crypto.randomUUID(),
            screenshot: f,
            precio: defaultPrecioMasivo,
            sku: "",
            imagenWoo: null,
            estado: "pendiente",
            seleccionado: true,
          });
        }
        return nuevas;
      });
      e.target.value = "";
    },
    [defaultPrecioMasivo],
  );

  const extraerTodasMasivas = useCallback(() => {
    if (!conectadaAnthropic) return;
    startMasivo(() => {
      void (async () => {
        const copia = [...filasMasivasRef.current];
        for (let i = 0; i < copia.length; i += 1) {
          const fila = copia[i];
          if (!fila.screenshot || !fila.precio.trim()) {
            copia[i] = { ...fila, estado: "error", errorMsg: "Falta screenshot o precio." };
            setFilasMasivas([...copia]);
            continue;
          }
          copia[i] = { ...fila, estado: "extraendo", errorMsg: undefined };
          setFilasMasivas([...copia]);

          const fd = new FormData();
          appendFormClaudeBase(fd);
          fd.set("nombre_base_sku", fila.sku.trim());
          fd.set("precio_venta", fila.precio.trim());
          fd.set("screenshot", fila.screenshot);

          const res = await extraerFichaProductoPorScreenshot(fd);
          if (res.ok) {
            copia[i] = {
              ...copia[i],
              estado: "extraido",
              ficha: res.ficha,
              errorMsg: undefined,
              seleccionado: true,
            };
            registrarCosto({
              titulo_seo: res.ficha.titulo_seo,
              photoroomLlamadas: res.uso_apis.photoroom_llamadas,
              anthropicInputTokens: res.uso_apis.anthropic_input_tokens,
              anthropicOutputTokens: res.uso_apis.anthropic_output_tokens,
            });
          } else {
            copia[i] = {
              ...copia[i],
              estado: "error",
              errorMsg: res.error,
              ficha: undefined,
            };
          }
          setFilasMasivas([...copia]);
        }
      })();
    });
  }, [appendFormClaudeBase, conectadaAnthropic, registrarCosto]);

  const crearWooSeleccionadosMasivo = useCallback(() => {
    if (!conectadaAnthropic) return;
    startMasivo(() => {
      void (async () => {
        const copia = [...filasMasivasRef.current];
        for (let i = 0; i < copia.length; i += 1) {
          const fila = copia[i];
          if (!fila.seleccionado || fila.estado !== "extraido" || !fila.ficha) continue;

          copia[i] = { ...fila, estado: "woo_error", errorMsg: undefined };
          setFilasMasivas([...copia]);

          const fd = new FormData();
          fd.set("ficha_json", JSON.stringify(fila.ficha));
          fd.set("precio_venta", fila.precio.trim());
          fd.set("nombre_base_sku", fila.sku.trim());
          fd.set("aprobacion_manual", aprobacionManual ? "true" : "false");
          if (fila.imagenWoo) fd.set("imagen_principal_woo", fila.imagenWoo);

          const res = await crearProductoWooDesdeFicha(fd);
          if (res.ok) {
            copia[i] = {
              ...fila,
              estado: "woo_ok",
              wooUrl: res.url_revision_woo,
              errorMsg: undefined,
            };
          } else {
            copia[i] = { ...fila, estado: "woo_error", errorMsg: res.error };
          }
          setFilasMasivas([...copia]);
        }
      })();
    });
  }, [aprobacionManual, conectadaAnthropic]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Herramientas IA — Carga Mágica por screenshot
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Photoroom opcional, Claude configurable y alta en WooCommerce (incluye modo masivo).
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 border-border">
          <Link href="/admin?tab=inventario">Volver a inventario</Link>
        </Button>
      </div>

      <div className="max-w-2xl">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" aria-hidden />
              <CardTitle className="text-base">Conectar APIs (solo este widget)</CardTitle>
            </div>
            <CardDescription>
              Anthropic es obligatorio. Photoroom es opcional (switch en la pestaña de carga).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {conectadaAnthropic ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs dark:border-primary/40 dark:bg-primary/10">
                <p className="font-medium text-foreground">Anthropic conectado</p>
                <p className="mt-1 text-muted-foreground">
                  <span className="font-mono text-foreground">{enmascararClave(claveAnthropic)}</span>
                </p>
                {photoroomConfigurada ? (
                  <p className="mt-1 text-muted-foreground">
                    Photoroom:{" "}
                    <span className="font-mono text-foreground">{enmascararClave(clavePhotoroom)}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Photoroom: no configurada (ok si la omitís).</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Pegá la clave de Anthropic y guardá.</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="widget_photoroom" className="text-xs font-medium text-muted-foreground">
                Photoroom API key <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="widget_photoroom"
                type="password"
                autoComplete="off"
                placeholder="Opcional si omitís Photoroom…"
                value={draftPhotoroom}
                onChange={(e) => setDraftPhotoroom(e.target.value)}
                className="h-10 border-border bg-background font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="widget_anthropic" className="text-xs font-medium text-muted-foreground">
                Anthropic API key
              </Label>
              <Input
                id="widget_anthropic"
                type="password"
                autoComplete="off"
                placeholder="Pegá tu clave aquí…"
                value={draftAnthropic}
                onChange={(e) => setDraftAnthropic(e.target.value)}
                className="h-10 border-border bg-background font-mono text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={guardarConexion} disabled={!draftAnthropic.trim()}>
                Guardar en este navegador
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-border"
                onClick={desconectar}
                disabled={!conectadaAnthropic && !draftAnthropic && !draftPhotoroom}
              >
                Desconectar y borrar claves
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="una" className="w-full">
        <TabsList className="border border-border bg-muted/40">
          <TabsTrigger value="una" className="gap-1">
            <Sparkles className="size-3.5" aria-hidden />
            Una carga
          </TabsTrigger>
          <TabsTrigger value="masiva" className="gap-1">
            <ListOrdered className="size-3.5" aria-hidden />
            Carga masiva
          </TabsTrigger>
        </TabsList>

        <TabsContent value="una" className="mt-4 space-y-6 outline-none">
          <form onSubmit={alSubmitCompleto} className="space-y-6">
            {!conectadaAnthropic ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground dark:border-destructive/50">
                Conectá Anthropic arriba para usar esta herramienta.
              </div>
            ) : null}
            {!omitirPhotoroom && !photoroomConfigurada ? (
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground dark:bg-muted/20">
                Sin clave Photoroom: activá &quot;Omitir Photoroom&quot; para probar solo datos + Woo con foto
                manual, o cargá la clave Photoroom.
              </div>
            ) : null}

            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <ListOrdered className="size-4 text-primary" aria-hidden />
                  <CardTitle className="text-base">Paso a paso</CardTitle>
                </div>
                <CardDescription>
                  Primero la extracción solo datos (si la usaste), después el pipeline hacia Woo. Los ítems se
                  listan en orden.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                {pasosExtraccion.length === 0 && lineasConsola.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Todavía no hay pasos. Usá &quot;Solo extraer datos&quot; o &quot;Pipeline completo&quot; para ver el progreso acá.
                  </p>
                ) : (
                  <div
                    className="max-h-[min(70vh,28rem)] space-y-6 overflow-y-auto rounded-md border border-border bg-muted/20 p-4 dark:bg-muted/10"
                    role="status"
                    aria-live="polite"
                    aria-relevant="additions"
                  >
                    <ListaPasosNumerados titulo="Extracción (solo Claude)" lineas={pasosExtraccion} />
                    <ListaPasosNumerados
                      titulo="Pipeline / WooCommerce"
                      lineas={lineasConsola}
                      startAt={pasosExtraccion.length > 0 ? pasosExtraccion.length + 1 : 1}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="border-b border-border pb-3">
                <CardTitle className="text-base">Opciones de pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4 dark:bg-muted/15">
                  <div className="space-y-1">
                    <Label htmlFor="omitir_ph" className="text-sm font-medium text-foreground">
                      Omitir Photoroom
                    </Label>
                    <p className="text-xs leading-snug text-muted-foreground">
                      Por defecto queda activado y se guarda en este navegador. Con Photoroom omitido no se usa la
                      API (plan vencido, pruebas de textos). Desactivalo solo si querés fondo blanco vía Photoroom.
                    </p>
                  </div>
                  <Switch
                    id="omitir_ph"
                    checked={omitirPhotoroom}
                    onCheckedChange={(v) => {
                      setOmitirPhotoroom(v);
                      guardarOmitirPhotoroomEnLocal(v);
                    }}
                    disabled={pending}
                    className="shrink-0"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border bg-card shadow-sm">
                <CardHeader className="border-b border-border pb-3">
                  <CardTitle className="text-base">Datos de carga</CardTitle>
                  <CardDescription>
                    {omitirPhotoroom
                      ? "Screenshot para Claude. Imagen principal opcional para Woo."
                      : "Foto cruda para Photoroom, screenshot para Claude e imagen Woo opcional (respaldo si Photoroom falla)."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="nombre_base_sku" className="text-xs font-medium text-muted-foreground">
                      Nombre Base o SKU (Opcional)
                    </Label>
                    <Input
                      id="nombre_base_sku"
                      name="nombre_base_sku"
                      placeholder="Ej. CMD0027-1"
                      disabled={pending}
                      className="h-10 border-border bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="precio_venta" className="text-xs font-medium text-muted-foreground">
                      Precio de Venta ($)
                    </Label>
                    <Input
                      id="precio_venta"
                      name="precio_venta"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="149"
                      required
                      disabled={pending}
                      className="h-10 border-border bg-background"
                    />
                  </div>
                  {!omitirPhotoroom ? (
                    <ZonaDropArchivo
                      etiqueta="Foto cruda (Photoroom)"
                      descripcion="Sube la Foto Cruda (Para Photoroom)"
                      archivo={fotoCruda}
                      inputRef={refFoto}
                      onSeleccion={setFotoCruda}
                      disabled={pending}
                    />
                  ) : null}
                  <ZonaDropArchivo
                    etiqueta="Screenshot proveedor"
                    descripcion="Sube la Screenshot (Para extraer datos)"
                    archivo={screenshot}
                    inputRef={refShot}
                    onSeleccion={setScreenshot}
                    disabled={pending}
                  />
                  <ZonaDropArchivo
                    etiqueta="Imagen principal para Woo (opcional)"
                    descripcion={
                      omitirPhotoroom
                        ? "Packshot manual; si no subís nada, el producto queda sin imagen."
                        : "Si Photoroom tiene cupo, no hace falta. Si falla por plan (402), se usa esta como respaldo."
                    }
                    archivo={imagenManualWoo}
                    inputRef={refImagenManual}
                    onSeleccion={setImagenManualWoo}
                    disabled={pending}
                  />
                </CardContent>
              </Card>

              <div className="flex flex-col gap-6">
                <Card className="border-border bg-card shadow-sm">
                  <CardHeader className="border-b border-border pb-3">
                    <CardTitle className="text-base">Control de flujo</CardTitle>
                    <CardDescription>Publicación en WooCommerce según revisión.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4 dark:bg-muted/15">
                      <div className="space-y-1">
                        <Label htmlFor="aprobacion_manual_switch" className="text-sm font-medium text-foreground">
                          Aprobación Manual Requerida
                        </Label>
                        <p className="text-xs leading-snug text-muted-foreground">
                          Si está activado, crea el producto como Borrador en Woo. Si no, lo publica directo.
                        </p>
                      </div>
                      <Switch
                        id="aprobacion_manual_switch"
                        checked={aprobacionManual}
                        onCheckedChange={setAprobacionManual}
                        disabled={pending}
                        className="shrink-0"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full gap-2 border-border"
                      onClick={abrirModalBorradores}
                    >
                      <FileStack className="size-4 shrink-0 text-primary" aria-hidden />
                      Ver y publicar borradores Woo
                    </Button>

                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-11 w-full border border-border"
                        disabled={pending || !conectadaAnthropic}
                        onClick={alExtraerSoloDatos}
                      >
                        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                        Solo extraer datos (sin Woo)
                      </Button>
                      {fichaExtraida ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 w-full border-border"
                          disabled={pending || !conectadaAnthropic}
                          onClick={alCrearWooDesdeFichaGuardada}
                        >
                          Crear en Woo con ficha extraída
                        </Button>
                      ) : null}
                      <Button
                        type="submit"
                        size="lg"
                        disabled={pending || !puedeProcesar}
                        className="h-14 w-full gap-2 text-base font-semibold shadow-sm"
                      >
                        {pending ? (
                          <>
                            <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
                            Procesando…
                          </>
                        ) : (
                          <>
                            <Sparkles className="size-5 shrink-0" aria-hidden />
                            Pipeline completo → Woo ✨
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {fichaExtraida ? (
                  <Card className="border-primary/30 bg-primary/5 shadow-sm dark:border-primary/40 dark:bg-primary/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Vista previa — ficha extraída</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <p>
                        <span className="text-muted-foreground">Título:</span>{" "}
                        <span className="font-medium text-foreground">{fichaExtraida.titulo_seo}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Slug:</span>{" "}
                        <span className="font-mono text-foreground">{fichaExtraida.slug}</span>
                      </p>
                      {resumenCatsExtraccion?.aplicadas?.length ? (
                        <p>
                          <span className="text-muted-foreground">Categorías Woo (IA):</span>{" "}
                          <span className="text-foreground">{resumenCatsExtraccion.aplicadas.join(" · ")}</span>
                        </p>
                      ) : null}
                      {resumenCatsExtraccion?.advertencia ? (
                        <p className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-sm text-foreground">
                          {resumenCatsExtraccion.advertencia}
                        </p>
                      ) : null}
                      <p className="text-muted-foreground">Revisá &quot;Paso a paso&quot; arriba para el detalle del flujo.</p>
                    </CardContent>
                  </Card>
                ) : null}

                <Card className="border-border bg-card shadow-sm">
                  <CardHeader className="border-b border-border pb-3">
                    <CardTitle className="text-base">Resultado</CardTitle>
                    <CardDescription>Resumen de la última creación en WooCommerce (el detalle va en Paso a paso).</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4">
                    {resultado?.ok ? (
                      <div className="space-y-3">
                        {ultimoCostoCarga && resultado.uso_apis.anthropic_input_tokens > 0 ? (
                          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs dark:bg-muted/15">
                            <p className="font-semibold text-foreground">Costo estimado de esta carga</p>
                            <p className="mt-1 text-muted-foreground">
                              Photoroom: USD {ultimoCostoCarga.usd_photoroom.toFixed(4)} · Anthropic: USD{" "}
                              {ultimoCostoCarga.usd_anthropic.toFixed(4)} ·{" "}
                              <span className="font-medium text-foreground">
                                Total USD {ultimoCostoCarga.usd_total.toFixed(4)}
                              </span>
                            </p>
                          </div>
                        ) : null}
                        {resultado.modo === "draft" ? (
                          <p className="text-sm font-medium text-foreground">
                            Éxito. Borrador creado en WooCommerce.
                          </p>
                        ) : (
                          <p className="text-sm font-medium text-foreground">
                            Éxito. Producto publicado directamente.
                          </p>
                        )}
                        <Card className="border-primary/30 bg-primary/5 shadow-none dark:border-primary/40 dark:bg-primary/10">
                          <CardContent className="space-y-3 pt-4">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Título SEO</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{resultado.titulo_seo}</p>
                            </div>
                            {resultado.categorias_aplicadas?.length ? (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Categorías Woo</p>
                                <p className="mt-1 text-xs text-foreground">
                                  {resultado.categorias_aplicadas.join(" · ")}
                                </p>
                              </div>
                            ) : null}
                            {resultado.categoria_advertencia ? (
                              <p className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs text-foreground">
                                {resultado.categoria_advertencia}
                              </p>
                            ) : null}
                            {resultado.prompt_foto_2 ? (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Prompt foto 2</p>
                                <p className="mt-1 max-h-24 overflow-y-auto text-[11px] text-muted-foreground">
                                  {resultado.prompt_foto_2}
                                </p>
                              </div>
                            ) : null}
                            <Button
                              type="button"
                              variant="secondary"
                              className="w-full border border-border sm:w-auto"
                              asChild
                            >
                              <a href={resultado.url_revision_woo} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="size-4" aria-hidden />
                                Ir a revisar {resultado.modo === "draft" ? "Borrador" : "Producto"} en WooCommerce
                              </a>
                            </Button>
                          </CardContent>
                        </Card>
                      </div>
                    ) : null}
                    {resultado && !resultado.ok ? (
                      <p className="text-sm text-destructive">{resultado.error}</p>
                    ) : null}
                    {!resultado ? (
                      <p className="text-sm text-muted-foreground">
                        Cuando completes el pipeline, acá verás costo de la carga, título y enlace a Woo.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="masiva" className="mt-4 space-y-4 outline-none">
          {!conectadaAnthropic ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground dark:border-destructive/50">
              Conectá Anthropic arriba.
            </div>
          ) : null}
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="text-base">Filas de capturas</CardTitle>
              <CardDescription>
                Agregá filas o elegí varias imágenes a la vez. Primero &quot;Extraer todas&quot; (solo Claude).
                Después revisá la tabla y &quot;Crear en Woo los seleccionados&quot;.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Precio por defecto (nuevas filas)</Label>
                  <Input
                    value={defaultPrecioMasivo}
                    onChange={(e) => setDefaultPrecioMasivo(e.target.value)}
                    className="h-9 w-28 border-border bg-background"
                  />
                </div>
                <Button type="button" size="sm" variant="secondary" className="border border-border" onClick={agregarFilaMasiva}>
                  <Plus className="size-4" aria-hidden />
                  Agregar fila
                </Button>
                <Button type="button" size="sm" variant="outline" className="border-border" asChild>
                  <label className="cursor-pointer">
                    <input
                      ref={refMultiShot}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={onMultiScreenshots}
                    />
                    Elegir varias capturas
                  </label>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!conectadaAnthropic || pendingMasivo || filasMasivas.length === 0}
                  onClick={extraerTodasMasivas}
                >
                  {pendingMasivo ? <Loader2 className="size-4 animate-spin" /> : null}
                  Extraer todas
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  disabled={!conectadaAnthropic || pendingMasivo}
                  onClick={crearWooSeleccionadosMasivo}
                >
                  Crear en Woo los seleccionados (extraídos)
                </Button>
              </div>

              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="border-b border-border bg-muted/50">
                    <tr>
                      <th className="w-10 p-2">
                        <span className="sr-only">Seleccionar</span>
                      </th>
                      <th className="p-2 font-medium text-muted-foreground">Captura</th>
                      <th className="p-2 font-medium text-muted-foreground">Precio</th>
                      <th className="p-2 font-medium text-muted-foreground">SKU opt.</th>
                      <th className="p-2 font-medium text-muted-foreground">Img Woo opt.</th>
                      <th className="p-2 font-medium text-muted-foreground">Título (extraído)</th>
                      <th className="p-2 font-medium text-muted-foreground">Estado</th>
                      <th className="p-2 font-medium text-muted-foreground">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasMasivas.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-4 text-muted-foreground">
                          No hay filas. Agregá una o elegí varias capturas.
                        </td>
                      </tr>
                    ) : (
                      filasMasivas.map((fila) => (
                        <FilaMasivaEditor
                          key={fila.id}
                          fila={fila}
                          disabled={pendingMasivo}
                          onChange={(next) => {
                            setFilasMasivas((prev) => prev.map((r) => (r.id === fila.id ? next : r)));
                          }}
                          onRemove={() => setFilasMasivas((prev) => prev.filter((r) => r.id !== fila.id))}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-10 grid gap-6 border-t border-border pt-10 lg:grid-cols-2">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="size-4 text-primary" aria-hidden />
              <CardTitle className="text-base">Control de costos (estimado)</CardTitle>
            </div>
            <CardDescription>
              Anthropic: tokens reales. Photoroom: costo fijo por imagen (0 si no lo usás).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">USD / 1M tokens entrada</Label>
                <Input
                  value={tarifaInputStr}
                  onChange={(e) => setTarifaInputStr(e.target.value)}
                  inputMode="decimal"
                  className="h-9 border-border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">USD / 1M tokens salida</Label>
                <Input
                  value={tarifaOutputStr}
                  onChange={(e) => setTarifaOutputStr(e.target.value)}
                  inputMode="decimal"
                  className="h-9 border-border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">USD / imagen Photoroom</Label>
                <Input
                  value={tarifaPhotoStr}
                  onChange={(e) => setTarifaPhotoStr(e.target.value)}
                  inputMode="decimal"
                  className="h-9 border-border bg-background"
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="border border-border"
              onClick={guardarTarifasClick}
            >
              Guardar tarifas
            </Button>

            <div className="rounded-lg border border-border bg-muted/30 p-3 dark:bg-muted/15">
              <p className="text-xs font-semibold text-foreground">Acumulado (cargas exitosas)</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>
                  Productos procesados OK:{" "}
                  <span className="font-medium text-foreground">{totalesCostos.cargasOk}</span>
                </li>
                <li>
                  Total Photoroom (estim.):{" "}
                  <span className="font-mono text-foreground">USD {totalesCostos.usdPhotoroom}</span>
                </li>
                <li>
                  Total Anthropic (estim.):{" "}
                  <span className="font-mono text-foreground">USD {totalesCostos.usdAnthropic}</span>
                </li>
                <li>
                  Total combinado:{" "}
                  <span className="font-mono font-semibold text-primary">USD {totalesCostos.usdTotal}</span>
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Últimas cargas</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive"
                onClick={limpiarHistorialCostos}
                disabled={logCostos.length === 0}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Limpiar historial
              </Button>
            </div>
            <div className="max-h-48 overflow-auto rounded-md border border-border">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 border-b border-border bg-muted/50">
                  <tr>
                    <th className="p-2 font-medium text-muted-foreground">Fecha</th>
                    <th className="p-2 font-medium text-muted-foreground">Título</th>
                    <th className="p-2 font-medium text-muted-foreground">Tokens in/out</th>
                    <th className="p-2 font-medium text-muted-foreground">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {logCostos.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-3 text-muted-foreground">
                        Todavía no hay cargas registradas.
                      </td>
                    </tr>
                  ) : (
                    [...logCostos].reverse().map((e) => (
                      <tr key={e.ts} className="border-b border-border/80">
                        <td className="whitespace-nowrap p-2 font-mono text-muted-foreground">
                          {new Date(e.ts).toLocaleString("es-UY", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="max-w-[140px] truncate p-2 text-foreground" title={e.titulo_seo}>
                          {e.titulo_seo ?? "—"}
                        </td>
                        <td className="whitespace-nowrap p-2 font-mono text-muted-foreground">
                          {e.anthropic_input_tokens}/{e.anthropic_output_tokens}
                        </td>
                        <td className="whitespace-nowrap p-2 font-mono text-foreground">
                          {e.usd_total.toFixed(4)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-base">Claude — modelo y prompt de sistema</CardTitle>
            <CardDescription>
              Ajustá título, slug y HTML. Se guarda en este navegador con &quot;Guardar prompt&quot;. Sonnet 4.6 suele
              ser buen balance costo/calidad con visión.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="modelo_claude_footer" className="text-xs font-medium text-muted-foreground">
                Modelo
              </Label>
              <Select
                value={modeloAnthropic}
                onValueChange={(v) => {
                  setModeloAnthropic(v);
                  guardarModeloAnthropicEnLocal(v);
                }}
              >
                <SelectTrigger id="modelo_claude_footer" className="h-10 border-border bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-72">
                  {MODELOS_CLAUDE_VISION.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt_sistema_claude_footer" className="text-xs font-medium text-muted-foreground">
                Prompt de sistema (instrucciones para título, slug, descripciones, JSON…)
              </Label>
              <Textarea
                id="prompt_sistema_claude_footer"
                value={promptSistema}
                onChange={(e) => setPromptSistema(e.target.value)}
                className="min-h-[220px] border-border bg-background font-mono text-xs"
                spellCheck={false}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="border border-border"
                  onClick={guardarPromptLocal}
                >
                  Guardar prompt en este navegador
                </Button>
                <Button type="button" size="sm" variant="outline" className="border-border" onClick={restaurarPromptDefault}>
                  Restaurar prompt por defecto
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={modalBorradoresAbierto} onOpenChange={setModalBorradoresAbierto}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="space-y-1 border-b border-border px-6 py-4 text-left">
            <DialogTitle>Borradores en WooCommerce</DialogTitle>
            <DialogDescription>
              Productos en estado borrador. Podés abrir el editor en Woo o publicar desde esta lista.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
            {errorModalBorradores ? (
              <p className="text-sm text-destructive" role="alert">
                {errorModalBorradores}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-border"
                disabled={cargandoListaBorradores}
                onClick={cargarListaBorradoresWoo}
              >
                {cargandoListaBorradores ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Actualizar listado
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
              {cargandoListaBorradores && itemsBorradoresWoo.length === 0 ? (
                <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Cargando borradores…
                </div>
              ) : null}
              {!cargandoListaBorradores && itemsBorradoresWoo.length === 0 && !errorModalBorradores ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No hay productos en borrador.</p>
              ) : null}
              {itemsBorradoresWoo.length > 0 ? (
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 backdrop-blur-sm">
                    <tr>
                      <th className="p-2 font-medium text-muted-foreground">Producto</th>
                      <th className="p-2 font-medium text-muted-foreground">SKU</th>
                      <th className="p-2 font-medium text-muted-foreground">Categorías</th>
                      <th className="p-2 font-medium text-muted-foreground">Desc. corta</th>
                      <th className="p-2 font-medium text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsBorradoresWoo.map((row) => (
                      <tr key={row.id} className="border-b border-border/80 align-top">
                        <td className="p-2">
                          <span className="font-medium text-foreground">{row.name}</span>
                          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">ID {row.id}</p>
                        </td>
                        <td className="p-2 font-mono text-muted-foreground">{row.sku || "—"}</td>
                        <td className="max-w-[200px] p-2 text-muted-foreground">
                          <span className="line-clamp-3">{row.categorias}</span>
                        </td>
                        <td className="max-w-[220px] p-2 text-muted-foreground">
                          <span className="line-clamp-4">{row.desc_corta_resumen}</span>
                        </td>
                        <td className="space-y-1 p-2">
                          <Button variant="outline" size="sm" className="h-8 w-full gap-1 border-border px-2" asChild>
                            <a href={row.url_editar} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                              Woo
                            </a>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 w-full"
                            disabled={publicandoBorradorId !== null}
                            onClick={() => void publicarBorradorDesdeModal(row.id)}
                          >
                            {publicandoBorradorId === row.id ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                            ) : (
                              "Publicar"
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilaMasivaEditor(props: {
  fila: FilaMasiva;
  disabled: boolean;
  onChange: (f: FilaMasiva) => void;
  onRemove: () => void;
}) {
  const { fila, disabled, onChange, onRemove } = props;
  const refShot = useRef<HTMLInputElement>(null);
  const refWoo = useRef<HTMLInputElement>(null);

  return (
    <tr className="border-b border-border/80 align-top">
      <td className="p-2">
        <Checkbox
          checked={fila.seleccionado}
          onCheckedChange={(v) => onChange({ ...fila, seleccionado: v === true })}
          disabled={disabled || fila.estado !== "extraido"}
          aria-label="Seleccionar para Woo"
        />
      </td>
      <td className="p-2">
        <input
          ref={refShot}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onChange({ ...fila, screenshot: f, estado: f ? "pendiente" : fila.estado });
          }}
        />
        <Button type="button" size="sm" variant="outline" className="border-border" onClick={() => refShot.current?.click()}>
          {fila.screenshot ? fila.screenshot.name.slice(0, 18) : "Elegir"}
        </Button>
      </td>
      <td className="p-2">
        <Input
          value={fila.precio}
          onChange={(e) => onChange({ ...fila, precio: e.target.value })}
          disabled={disabled}
          className="h-8 border-border bg-background text-xs"
        />
      </td>
      <td className="p-2">
        <Input
          value={fila.sku}
          onChange={(e) => onChange({ ...fila, sku: e.target.value })}
          disabled={disabled}
          className="h-8 border-border bg-background text-xs"
        />
      </td>
      <td className="p-2">
        <input
          ref={refWoo}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onChange({ ...fila, imagenWoo: f });
          }}
        />
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => refWoo.current?.click()}>
          {fila.imagenWoo ? "OK" : "—"}
        </Button>
      </td>
      <td className="max-w-[180px] p-2 text-foreground">
        <span className="line-clamp-2" title={fila.ficha?.titulo_seo}>
          {fila.ficha?.titulo_seo ?? "—"}
        </span>
      </td>
      <td className="p-2 text-muted-foreground">
        {fila.estado === "pendiente" ? "Pendiente" : null}
        {fila.estado === "extraendo" ? "Extrayendo…" : null}
        {fila.estado === "extraido" ? "Listo" : null}
        {fila.estado === "error" ? <span className="text-destructive">Error</span> : null}
        {fila.estado === "woo_ok" ? "Woo OK" : null}
        {fila.estado === "woo_error" ? <span className="text-destructive">Woo error</span> : null}
        {fila.errorMsg ? (
          <span className="mt-1 block text-[10px] text-destructive" title={fila.errorMsg}>
            {fila.errorMsg.slice(0, 80)}
          </span>
        ) : null}
      </td>
      <td className="p-2">
        {fila.wooUrl ? (
          <Button variant="link" className="h-auto p-0 text-xs" asChild>
            <a href={fila.wooUrl} target="_blank" rel="noopener noreferrer">
              Abrir
            </a>
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" className="h-8 text-destructive" onClick={onRemove}>
          Quitar
        </Button>
      </td>
    </tr>
  );
}
