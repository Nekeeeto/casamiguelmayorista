"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  DollarSign,
  GripVertical,
  ImagePlus,
  LayoutGrid,
  Loader2,
  Plus,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import {
  actualizarCampoB2BProductoAction,
  actualizarProveedorProductoAction,
  actualizarCamposWooProductoAction,
  cargarSerieCostoProductoHistorialAction,
  cargarSerieRentabilidadWebProductoAction,
  type DatosB2BProducto,
} from "@/app/(admin)/inventario/[id]/actions";
import type { PresetRangoAnaliticasId } from "@/lib/analiticas-rango-fechas-utc";
import { formatoIsoFechaUtc, rangoDesdePreset } from "@/lib/analiticas-rango-fechas-utc";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type CategoriaWoo = {
  id: number;
  name: string;
  parent?: number;
};

type Props = {
  productId: number;
  productoInicial: Record<string, unknown>;
  categoriasDisponibles: CategoriaWoo[];
  datosB2BIniciales: DatosB2BProducto;
  proveedoresDisponibles: { id: string; nombre_fantasia: string; logo_url: string | null }[];
  proveedorIdInicial: string;
};

type ToastState = { tipo: "ok" | "error"; mensaje: string } | null;
type OpcionCategoriaJerarquica = { id: number; etiqueta: string };

function esIgual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseNumero(raw: string, fallback: number) {
  const n = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function parseEntero(raw: string, fallback: number) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function boolDesdeStatus(status: unknown) {
  return String(status ?? "draft") === "publish";
}

function normalizarCategorias(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => x as { id?: unknown })
    .filter((x) => Number.isFinite(Number(x.id)))
    .map((x) => Number(x.id));
}

type ImagenProductoEdicion = {
  id?: number;
  /** Solo en cliente, para keys y diff hasta que Woo devuelva `id`. */
  claveLocal?: string;
  src: string;
  name: string;
  alt: string;
};

function normalizarListaImagenesEdicion(value: unknown): ImagenProductoEdicion[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const o = raw as Record<string, unknown>;
    const id = Number(o.id);
    const claveLocal = typeof o.claveLocal === "string" ? o.claveLocal : undefined;
    return {
      ...(Number.isFinite(id) && id > 0 ? { id } : {}),
      ...(claveLocal ? { claveLocal } : {}),
      src: String(o.src ?? ""),
      name: String(o.name ?? ""),
      alt: String(o.alt ?? ""),
    };
  });
}

function firmarImagenesParaDiff(lista: ImagenProductoEdicion[]) {
  return lista.map((img) => ({
    id: img.id ?? 0,
    local: img.claveLocal ?? "",
    src: img.src,
    name: img.name,
    alt: img.alt,
  }));
}

function imagenesAWooRestPayload(lista: ImagenProductoEdicion[]): Record<string, unknown>[] {
  return lista.map((img) => {
    const id = Number(img.id);
    const o: Record<string, unknown> = { src: img.src };
    const name = img.name.trim();
    const alt = img.alt.trim();
    if (name) o.name = name;
    if (alt) o.alt = alt;
    if (Number.isFinite(id) && id > 0) o.id = id;
    return o;
  });
}

function comprimirImagenArchivoADataUrl(file: File, maxAncho = 1600, calidad = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxAncho) {
        height = Math.round((height * maxAncho) / width);
        width = maxAncho;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo preparar la imagen."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

/** Primeros 10 caracteres YYYY-MM-DD desde respuesta Woo (date_on_sale_* o *_gmt). */
function fechaWooSoloDia(valor: unknown): string {
  if (valor == null) return "";
  const s = String(valor).trim();
  if (!s || s === "null") return "";
  return s.length >= 10 ? s.slice(0, 10) : "";
}

function construirOpcionesCategoriasJerarquicas(categorias: CategoriaWoo[]): OpcionCategoriaJerarquica[] {
  const porPadre = new Map<number, CategoriaWoo[]>();
  for (const cat of categorias) {
    const padre = Number(cat.parent ?? 0);
    const lista = porPadre.get(padre) ?? [];
    lista.push(cat);
    porPadre.set(padre, lista);
  }
  for (const lista of porPadre.values()) {
    lista.sort((a, b) => a.name.localeCompare(b.name));
  }

  const visitados = new Set<number>();
  const out: OpcionCategoriaJerarquica[] = [];
  const dfs = (padre: number, profundidad: number) => {
    for (const cat of porPadre.get(padre) ?? []) {
      if (visitados.has(cat.id)) continue;
      visitados.add(cat.id);
      out.push({
        id: cat.id,
        etiqueta: `${"\u00A0\u00A0".repeat(profundidad)}${profundidad > 0 ? "↳ " : ""}${cat.name}`,
      });
      dfs(cat.id, profundidad + 1);
    }
  };
  dfs(0, 0);
  for (const cat of categorias) {
    if (visitados.has(cat.id)) continue;
    out.push({ id: cat.id, etiqueta: cat.name });
  }
  return out;
}

/** Ruta legible tipo "Golosinas > Promos" usando la jerarquía `parent` de Woo. */
function rutaJerarquicaCategoria(categorias: CategoriaWoo[], id: number): string {
  const porId = new Map<number, CategoriaWoo>();
  for (const c of categorias) porId.set(c.id, c);
  const segmentos: string[] = [];
  let cur: CategoriaWoo | undefined = porId.get(id);
  const vistos = new Set<number>();
  while (cur && !vistos.has(cur.id)) {
    vistos.add(cur.id);
    segmentos.unshift(cur.name);
    const padre = Number(cur.parent ?? 0);
    if (!padre) break;
    cur = porId.get(padre);
  }
  if (segmentos.length === 0) return `Categoría #${id}`;
  return segmentos.join(" > ");
}

export function InventarioProductoPim({
  productId,
  productoInicial,
  categoriasDisponibles,
  datosB2BIniciales,
  proveedoresDisponibles,
  proveedorIdInicial,
}: Props) {
  const [producto, setProducto] = useState<Record<string, unknown>>(productoInicial);
  const [productoGuardado, setProductoGuardado] = useState<Record<string, unknown>>(productoInicial);
  const [b2bGuardado, setB2bGuardado] = useState<DatosB2BProducto>(datosB2BIniciales);
  const [toast, setToast] = useState<ToastState>(null);
  const [pendiente, startTransition] = useTransition();

  const [nombre, setNombre] = useState(String(productoInicial.name ?? ""));
  const [descripcionCorta, setDescripcionCorta] = useState(String(productoInicial.short_description ?? ""));
  const [descripcionLarga, setDescripcionLarga] = useState(String(productoInicial.description ?? ""));
  const [sku, setSku] = useState(String(productoInicial.sku ?? ""));
  const [stockQty, setStockQty] = useState(String(productoInicial.stock_quantity ?? ""));
  const [manageStock, setManageStock] = useState(Boolean(productoInicial.manage_stock));
  const [stockStatus, setStockStatus] = useState(String(productoInicial.stock_status ?? "instock"));
  const [statusPublicado, setStatusPublicado] = useState(boolDesdeStatus(productoInicial.status));
  const [featured, setFeatured] = useState(Boolean(productoInicial.featured));
  const [metaDataJson, setMetaDataJson] = useState(JSON.stringify(productoInicial.meta_data ?? [], null, 2));
  const [attributesJson, setAttributesJson] = useState(
    JSON.stringify(productoInicial.attributes ?? [], null, 2),
  );
  const [precioCostoInput, setPrecioCostoInput] = useState(String(datosB2BIniciales.precio_costo));
  const [precioMayoristaInput, setPrecioMayoristaInput] = useState(String(datosB2BIniciales.precio_mayorista));
  const [compraMinimaInput, setCompraMinimaInput] = useState(String(datosB2BIniciales.compra_minima));
  const [categoriasSeleccionadas, setCategoriasSeleccionadas] = useState<number[]>(
    normalizarCategorias(productoInicial.categories),
  );
  const [categoriaAAgregar, setCategoriaAAgregar] = useState<string>("");

  const [regularPriceWooInput, setRegularPriceWooInput] = useState(
    String(productoInicial.regular_price ?? ""),
  );
  const [salePriceWooInput, setSalePriceWooInput] = useState(String(productoInicial.sale_price ?? ""));
  const [fechaOfertaDesde, setFechaOfertaDesde] = useState(() =>
    fechaWooSoloDia(
      productoInicial.date_on_sale_from ?? productoInicial.date_on_sale_from_gmt,
    ),
  );
  const [fechaOfertaHasta, setFechaOfertaHasta] = useState(() =>
    fechaWooSoloDia(productoInicial.date_on_sale_to ?? productoInicial.date_on_sale_to_gmt),
  );

  const [presetSerieRentabilidad, setPresetSerieRentabilidad] =
    useState<PresetRangoAnaliticasId>("ultimos_7");
  const [serieRentabilidadPuntos, setSerieRentabilidadPuntos] = useState<
    { dia: string; ingresos: number; unidades: number }[] | null
  >(null);
  const [serieRentabilidadTruncado, setSerieRentabilidadTruncado] = useState(false);
  const [serieRentabilidadCargando, setSerieRentabilidadCargando] = useState(false);
  const [serieRentabilidadError, setSerieRentabilidadError] = useState<string | null>(null);
  const [serieCostoPuntos, setSerieCostoPuntos] = useState<
    { dia: string; corto: string; costo: number }[] | null
  >(null);
  const [serieCostoCargando, setSerieCostoCargando] = useState(false);
  const [serieCostoError, setSerieCostoError] = useState<string | null>(null);

  const [pestanaInventario, setPestanaInventario] = useState("general");
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(
    proveedorIdInicial.trim() || "sin-proveedor",
  );
  const proveedorActivo = useMemo(
    () => proveedoresDisponibles.find((proveedor) => proveedor.id === proveedorSeleccionado) ?? null,
    [proveedorSeleccionado, proveedoresDisponibles],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setSerieRentabilidadCargando(true);
      setSerieRentabilidadTruncado(false);
      setSerieRentabilidadError(null);
      const { desde, hasta } = rangoDesdePreset(presetSerieRentabilidad);
      const desdeIso = formatoIsoFechaUtc(desde);
      const hastaIso = formatoIsoFechaUtc(hasta);
      const resVentas = await cargarSerieRentabilidadWebProductoAction(productId, desdeIso, hastaIso);
      if (cancelado) return;
      setSerieRentabilidadCargando(false);
      if (!resVentas.ok) {
        setSerieRentabilidadError(resVentas.error);
        setSerieRentabilidadPuntos(null);
      } else {
        setSerieRentabilidadPuntos(resVentas.puntos);
        setSerieRentabilidadTruncado(resVentas.truncado);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [productId, presetSerieRentabilidad]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setSerieCostoCargando(true);
      setSerieCostoError(null);
      const { desde, hasta } = rangoDesdePreset(presetSerieRentabilidad);
      const desdeIso = formatoIsoFechaUtc(desde);
      const hastaIso = formatoIsoFechaUtc(hasta);
      const resCosto = await cargarSerieCostoProductoHistorialAction(productId, desdeIso, hastaIso);
      if (cancelado) return;
      setSerieCostoCargando(false);
      if (!resCosto.ok) {
        setSerieCostoError(resCosto.error);
        setSerieCostoPuntos(null);
      } else {
        setSerieCostoPuntos(resCosto.puntos);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [productId, presetSerieRentabilidad, b2bGuardado.precio_costo]);

  const etiquetaCategoriaPorId = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of categoriasDisponibles) {
      m.set(c.id, rutaJerarquicaCategoria(categoriasDisponibles, c.id));
    }
    return m;
  }, [categoriasDisponibles]);
  const categoriasJerarquicas = useMemo(
    () => construirOpcionesCategoriasJerarquicas(categoriasDisponibles),
    [categoriasDisponibles],
  );

  const imagenes = useMemo(
    () => normalizarListaImagenesEdicion(producto.images).filter((i) => i.src.length > 0),
    [producto.images],
  );
  const inputArchivosGaleriaRef = useRef<HTMLInputElement>(null);
  const [arrastrandoIndice, setArrastrandoIndice] = useState<number | null>(null);
  const [procesandoGaleria, setProcesandoGaleria] = useState(false);
  const imagenDestacada = imagenes[0] ?? null;
  const categoriaPrincipalId = categoriasSeleccionadas[0] ?? null;
  const permalink = String(producto.permalink ?? "");
  const etiquetaEstadoPublicacion = statusPublicado ? "publicado" : "borrador";
  const enStock =
    stockStatus === "instock" ||
    (manageStock && stockQty.trim().length > 0 && parseEntero(stockQty, 0) > 0);
  const totalVentasWebRaw = Number.parseFloat(String(producto.total_sales ?? 0).replace(",", "."));
  const totalVentasWeb = Number.isFinite(totalVentasWebRaw)
    ? Math.max(0, Math.floor(totalVentasWebRaw))
    : 0;

  const regularPriceDraft = Number.parseFloat(regularPriceWooInput.replace(",", "."));
  const salePriceDraft = Number.parseFloat(salePriceWooInput.replace(",", "."));
  const hayPrecioOfertaWeb = Number.isFinite(salePriceDraft) && salePriceDraft > 0;
  const mostrarPrecioRegularTachado =
    hayPrecioOfertaWeb && Number.isFinite(regularPriceDraft) && regularPriceDraft > 0;
  const precioRetail =
    Number.isFinite(salePriceDraft) && salePriceDraft > 0 ? salePriceDraft : regularPriceDraft;
  const precioWebActivo = Number.isFinite(precioRetail) ? precioRetail : 0;

  const precioMayoristaCalc = parseNumero(precioMayoristaInput, b2bGuardado.precio_mayorista);
  const costoCalc = parseNumero(precioCostoInput, b2bGuardado.precio_costo);
  const gananciaWeb = Number((precioWebActivo - costoCalc).toFixed(2));
  const margenPctWeb =
    precioWebActivo > 0 ? Number(((gananciaWeb / precioWebActivo) * 100).toFixed(1)) : null;
  const gananciaMayorista = Number((precioMayoristaCalc - costoCalc).toFixed(2));
  const margenPctMayorista =
    precioMayoristaCalc > 0
      ? Number(((gananciaMayorista / precioMayoristaCalc) * 100).toFixed(1))
      : null;

  const cargandoGraficasRentabilidad = serieRentabilidadCargando || serieCostoCargando;
  const periodoRangoMuyAmplio =
    presetSerieRentabilidad === "periodo_maximo" || presetSerieRentabilidad === "este_anio";

  const datosGraficoRentabilidadWeb = useMemo(() => {
    const costoU = parseNumero(precioCostoInput, b2bGuardado.precio_costo);
    if (!serieRentabilidadPuntos?.length) return [];
    return serieRentabilidadPuntos.map((p) => {
      const costoDia = Number((p.unidades * costoU).toFixed(2));
      const ganancia = Number((p.ingresos - costoDia).toFixed(2));
      return {
        dia: p.dia,
        corto: p.dia.slice(5),
        ganancia,
        ingresos: p.ingresos,
      };
    });
  }, [serieRentabilidadPuntos, precioCostoInput, b2bGuardado.precio_costo]);

  const gananciaTotalWebPeriodo = useMemo(() => {
    if (!datosGraficoRentabilidadWeb.length) return null;
    const suma = datosGraficoRentabilidadWeb.reduce((acc, p) => acc + p.ganancia, 0);
    return Number(suma.toFixed(2));
  }, [datosGraficoRentabilidadWeb]);

  const estiloTooltipGrafico = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    fontSize: "12px",
  } as const;

  function formatoMonedaGrafico(valor: number) {
    return new Intl.NumberFormat("es-UY", {
      style: "currency",
      currency: "UYU",
      maximumFractionDigits: 0,
    }).format(valor);
  }

  const colorPorMargen = (margen: number | null) =>
    margen == null
      ? "text-muted-foreground"
      : margen < 20
        ? "text-destructive"
        : margen > 40
          ? "text-primary"
          : "text-foreground";

  function construirWooPatch(strict: boolean): {
    patch: Record<string, unknown>;
    count: number;
    errores: string[];
  } {
    const patch: Record<string, unknown> = {};
    let count = 0;
    const errores: string[] = [];
    const track = (key: string, value: unknown) => {
      if (!esIgual(productoGuardado[key], value)) {
        patch[key] = value;
        count += 1;
      }
    };

    track("name", nombre);
    track("short_description", descripcionCorta);
    track("description", descripcionLarga);
    track("sku", sku);
    const stockNormalizado = stockQty.trim().length === 0 ? null : Math.max(0, parseEntero(stockQty, 0));
    track("stock_quantity", stockNormalizado);
    track("manage_stock", manageStock);
    track("stock_status", stockStatus);
    track("status", statusPublicado ? "publish" : "draft");
    track("featured", featured);
    const categoriasGuardadasIds = normalizarCategorias(productoGuardado.categories);
    if (!esIgual(categoriasGuardadasIds, categoriasSeleccionadas)) {
      patch.categories = categoriasSeleccionadas.map((id) => ({ id }));
      count += 1;
    }

    const imgsGuard = firmarImagenesParaDiff(normalizarListaImagenesEdicion(productoGuardado.images));
    const imgsDraft = firmarImagenesParaDiff(normalizarListaImagenesEdicion(producto.images));
    if (!esIgual(imgsGuard, imgsDraft)) {
      patch.images = imagenesAWooRestPayload(normalizarListaImagenesEdicion(producto.images));
      count += 1;
    }

    const regularGuard = String(productoGuardado.regular_price ?? "").trim();
    if (regularPriceWooInput.trim() !== regularGuard) {
      patch.regular_price = regularPriceWooInput.trim();
      count += 1;
    }
    const saleGuard = String(productoGuardado.sale_price ?? "").trim();
    if (salePriceWooInput.trim() !== saleGuard) {
      patch.sale_price = salePriceWooInput.trim();
      count += 1;
    }

    const fromGuard = fechaWooSoloDia(
      productoGuardado.date_on_sale_from ?? productoGuardado.date_on_sale_from_gmt,
    );
    const toGuard = fechaWooSoloDia(
      productoGuardado.date_on_sale_to ?? productoGuardado.date_on_sale_to_gmt,
    );
    if (fechaOfertaDesde.trim() !== fromGuard) {
      patch.date_on_sale_from = fechaOfertaDesde.trim()
        ? `${fechaOfertaDesde.trim()}T00:00:00`
        : "";
      count += 1;
    }
    if (fechaOfertaHasta.trim() !== toGuard) {
      patch.date_on_sale_to = fechaOfertaHasta.trim()
        ? `${fechaOfertaHasta.trim()}T23:59:59`
        : "";
      count += 1;
    }

    const metaParsed = (() => {
      try {
        return { ok: true as const, value: JSON.parse(metaDataJson) };
      } catch {
        return { ok: false as const };
      }
    })();
    if (metaParsed.ok) {
      track("meta_data", metaParsed.value);
    } else if (strict) {
      errores.push("JSON inválido en meta_data.");
    }

    const attrParsed = (() => {
      try {
        return { ok: true as const, value: JSON.parse(attributesJson) };
      } catch {
        return { ok: false as const };
      }
    })();
    if (attrParsed.ok) {
      track("attributes", attrParsed.value);
    } else if (strict) {
      errores.push("JSON inválido en attributes.");
    }

    if (strict && "regular_price" in patch && String(patch.regular_price ?? "").trim() === "") {
      errores.push("El precio regular no puede quedar vacío.");
    }

    if (strict && "images" in patch) {
      const lista = normalizarListaImagenesEdicion(producto.images);
      if (lista.some((i) => !i.src.trim())) {
        errores.push("Hay imágenes sin archivo o URL; quitá la fila vacía o volvé a subirla.");
      }
    }

    return { patch, count, errores };
  }

  function construirB2BDiff() {
    const precio_costo = Number(parseNumero(precioCostoInput, b2bGuardado.precio_costo).toFixed(2));
    const precio_mayorista = Number(
      parseNumero(precioMayoristaInput, b2bGuardado.precio_mayorista).toFixed(2),
    );
    const compra_minima = Math.max(1, parseEntero(compraMinimaInput, b2bGuardado.compra_minima));
    const cambios: Array<["precio_costo" | "precio_mayorista" | "compra_minima", number]> = [];
    if (precio_costo !== Number(b2bGuardado.precio_costo.toFixed(2))) cambios.push(["precio_costo", precio_costo]);
    if (precio_mayorista !== Number(b2bGuardado.precio_mayorista.toFixed(2)))
      cambios.push(["precio_mayorista", precio_mayorista]);
    if (compra_minima !== b2bGuardado.compra_minima) cambios.push(["compra_minima", compra_minima]);
    return { cambios, valores: { precio_costo, precio_mayorista, compra_minima } };
  }

  const { count: cambiosWooCount } = construirWooPatch(false);
  const { cambios: cambiosB2B } = construirB2BDiff();
  const cantidadCambios = cambiosWooCount + cambiosB2B.length;

  function agregarCategoria(id: number) {
    if (categoriasSeleccionadas.includes(id)) {
      setCategoriaAAgregar("");
      return;
    }
    setCategoriasSeleccionadas([...categoriasSeleccionadas, id]);
    setCategoriaAAgregar("");
  }

  function quitarCategoria(id: number) {
    setCategoriasSeleccionadas(categoriasSeleccionadas.filter((x) => x !== id));
  }

  function setImagenesProducto(nueva: ImagenProductoEdicion[]) {
    setProducto((p) => ({ ...p, images: nueva }));
  }

  function moverImagenGaleria(desde: number, hacia: number) {
    if (hacia < 0 || hacia >= imagenes.length) return;
    const copia = [...imagenes];
    const [sacado] = copia.splice(desde, 1);
    copia.splice(hacia, 0, sacado);
    setImagenesProducto(copia);
  }

  function eliminarImagenGaleria(indice: number) {
    setImagenesProducto(imagenes.filter((_, i) => i !== indice));
  }

  function actualizarImagenGaleria(indice: number, campo: "name" | "alt", valor: string) {
    const copia = imagenes.map((img, i) => (i === indice ? { ...img, [campo]: valor } : img));
    setImagenesProducto(copia);
  }

  async function agregarArchivosGaleria(files: FileList | null) {
    if (!files?.length) return;
    setProcesandoGaleria(true);
    try {
      const nuevas: ImagenProductoEdicion[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 25 * 1024 * 1024) {
          setToast({ tipo: "error", mensaje: `Archivo demasiado grande: ${file.name}` });
          continue;
        }
        try {
          const src = await comprimirImagenArchivoADataUrl(file);
          const baseNombre = file.name.replace(/\.[^/.]+$/, "").trim() || "imagen";
          nuevas.push({
            claveLocal: crypto.randomUUID(),
            src,
            name: baseNombre,
            alt: "",
          });
        } catch {
          setToast({ tipo: "error", mensaje: `No se pudo procesar: ${file.name}` });
        }
      }
      if (nuevas.length > 0) {
        setImagenesProducto([...imagenes, ...nuevas]);
      }
    } finally {
      setProcesandoGaleria(false);
      if (inputArchivosGaleriaRef.current) inputArchivosGaleriaRef.current.value = "";
    }
  }

  function aplicarRespuestaWooYGuardado(p: Record<string, unknown>) {
    setProducto(p);
    setProductoGuardado(p);
    setRegularPriceWooInput(String(p.regular_price ?? ""));
    setSalePriceWooInput(String(p.sale_price ?? ""));
    setFechaOfertaDesde(fechaWooSoloDia(p.date_on_sale_from ?? p.date_on_sale_from_gmt));
    setFechaOfertaHasta(fechaWooSoloDia(p.date_on_sale_to ?? p.date_on_sale_to_gmt));
  }

  function guardarTodo() {
    const { patch, errores } = construirWooPatch(true);
    const { cambios, valores } = construirB2BDiff();
    if (errores.length > 0) {
      setToast({ tipo: "error", mensaje: errores[0] });
      return;
    }
    if (Object.keys(patch).length === 0 && cambios.length === 0) {
      return;
    }

    startTransition(async () => {
      if (Object.keys(patch).length > 0) {
        const resWoo = await actualizarCamposWooProductoAction(productId, patch);
        if (!resWoo.ok) {
          setToast({ tipo: "error", mensaje: resWoo.error });
          return;
        }
        aplicarRespuestaWooYGuardado(resWoo.producto);
      }

      if (cambios.length > 0) {
        let ultimo = b2bGuardado;
        for (const [campo, valor] of cambios) {
          const res = await actualizarCampoB2BProductoAction(productId, campo, valor);
          if (!res.ok) {
            setToast({ tipo: "error", mensaje: res.error });
            return;
          }
          ultimo = res.datos;
        }
        setB2bGuardado(ultimo);
        setPrecioCostoInput(String(ultimo.precio_costo));
        setPrecioMayoristaInput(String(ultimo.precio_mayorista));
        setCompraMinimaInput(String(ultimo.compra_minima));
      } else {
        setPrecioCostoInput(String(valores.precio_costo));
        setPrecioMayoristaInput(String(valores.precio_mayorista));
        setCompraMinimaInput(String(valores.compra_minima));
      }

      setToast({ tipo: "ok", mensaje: "Cambios guardados." });
    });
  }

  function asignarProveedor(value: string) {
    const siguiente = value || "sin-proveedor";
    setProveedorSeleccionado(siguiente);
    startTransition(async () => {
      const res = await actualizarProveedorProductoAction(
        productId,
        siguiente === "sin-proveedor" ? null : siguiente,
      );
      if (!res.ok) {
        setToast({ tipo: "error", mensaje: res.error });
        return;
      }
      setProveedorSeleccionado(res.proveedor_id ?? "sin-proveedor");
      setToast({ tipo: "ok", mensaje: "Proveedor actualizado." });
    });
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <div
          className={`fixed right-4 top-4 z-50 rounded-md border px-3 py-2 text-sm shadow-sm ${
            toast.tipo === "ok"
              ? "border-border bg-card text-foreground"
              : "border-destructive/50 bg-destructive/10 text-destructive"
          }`}
        >
          {toast.mensaje}
        </div>
      ) : null}

      <Card className="sticky top-4 z-20 bg-card/95 backdrop-blur">
        <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="size-14 overflow-hidden rounded-md border border-border bg-muted/30">
              {imagenDestacada ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagenDestacada.src} alt={nombre} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="space-y-1">
              <CardTitle className="text-lg">{nombre}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge
                  variante={totalVentasWeb > 0 ? "success" : "destructive"}
                  className={
                    totalVentasWeb > 0
                      ? "border-primary/50"
                      : "border-destructive/30 bg-destructive/5 text-destructive/80"
                  }
                  title="Unidades vendidas en la tienda Woo (total acumulado del producto)"
                >
                  {totalVentasWeb.toLocaleString("es-UY")} ventas web
                </Badge>
                <Badge variante={statusPublicado ? "success" : "warning"}>
                  {etiquetaEstadoPublicacion}
                </Badge>
                <Badge variante={enStock ? "success" : "destructive"}>
                  {enStock ? "en stock" : "sin stock"}
                </Badge>
                <span>Woo ID #{productId}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cantidadCambios > 0 ? (
              <Button
                type="button"
                onClick={guardarTodo}
                disabled={pendiente}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {pendiente ? "Guardando..." : "Guardar cambios"}
              </Button>
            ) : null}
            {permalink ? (
              <Link
                href={permalink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Ver en Tienda
              </Link>
            ) : null}
            <Link
              href="/admin?tab=inventario"
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Volver a Inventario
            </Link>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={pestanaInventario} onValueChange={setPestanaInventario} className="space-y-3">
        <TabsList className="mx-auto grid h-auto w-full max-w-6xl grid-cols-2 gap-2 rounded-xl border border-border/70 bg-card/60 p-2 backdrop-blur lg:grid-cols-5">
          <TabsTrigger value="general" className="h-10 gap-2 rounded-lg">
            <LayoutGrid className="size-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="rentabilidad-web" className="h-10 gap-2 rounded-lg">
            <DollarSign className="size-4" />
            Rentabilidad Web
          </TabsTrigger>
          <TabsTrigger value="rentabilidad-mayorista" className="h-10 gap-2 rounded-lg">
            <Tag className="size-4" />
            Rentabilidad Mayorista
          </TabsTrigger>
          <TabsTrigger value="inventario" className="h-10 gap-2 rounded-lg">
            <Boxes className="size-4" />
            Inventario
          </TabsTrigger>
          <TabsTrigger value="avanzado" className="h-10 gap-2 rounded-lg">
            <SlidersHorizontal className="size-4" />
            Avanzado
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-4">
            <Card className="bg-card xl:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Proveedor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3 rounded-md border border-border bg-muted/20 p-2.5">
                  <div className="flex h-11 w-14 items-center justify-center overflow-hidden rounded-md bg-background">
                    {proveedorActivo?.logo_url ? (
                      <Image
                        src={proveedorActivo.logo_url}
                        alt={proveedorActivo.nombre_fantasia}
                        width={56}
                        height={44}
                        className="h-9 w-auto max-w-12 object-contain"
                        unoptimized
                      />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Sin logo</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {proveedorActivo?.nombre_fantasia ?? "Sin proveedor"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Vinculación rápida</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pim-proveedor">Proveedor vinculado</Label>
                  <Select value={proveedorSeleccionado} onValueChange={asignarProveedor}>
                    <SelectTrigger id="pim-proveedor">
                      <SelectValue placeholder="Sin proveedor" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="sin-proveedor">Sin proveedor</SelectItem>
                      {proveedoresDisponibles.map((proveedor) => (
                        <SelectItem key={proveedor.id} value={proveedor.id}>
                          {proveedor.nombre_fantasia}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card xl:col-span-3">
              <CardHeader>
                <CardTitle>Información principal</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="pim-name">Nombre</Label>
                  <Input id="pim-name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pim-short-description">Descripción corta</Label>
                  <Textarea
                    id="pim-short-description"
                    value={descripcionCorta}
                    onChange={(e) => setDescripcionCorta(e.target.value)}
                    className="min-h-[180px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pim-description">Descripción larga</Label>
                  <Textarea
                    id="pim-description"
                    value={descripcionLarga}
                    onChange={(e) => setDescripcionLarga(e.target.value)}
                    className="min-h-[180px]"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>Galería</CardTitle>
                <p className="text-xs text-muted-foreground">
                  La primera imagen es la destacada en Woo. Reordená, editá título o texto alternativo, eliminá o agregá
                  archivos. Guardá cambios para aplicar en la tienda (subida vía API Woo).
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <input
                  ref={inputArchivosGaleriaRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => void agregarArchivosGaleria(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={procesandoGaleria || pendiente}
                  onClick={() => inputArchivosGaleriaRef.current?.click()}
                >
                  {procesandoGaleria ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <ImagePlus className="size-4" aria-hidden />
                  )}
                  Agregar imágenes
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {imagenes.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  Sin imágenes. Usá &quot;Agregar imágenes&quot; o guardá después de subir.
                </p>
              ) : (
                <ul className="space-y-3">
                  {imagenes.map((img, indice) => {
                    const keyFila =
                      img.id != null && img.id > 0
                        ? `id-${img.id}`
                        : img.claveLocal ?? `src-${img.src.slice(0, 96)}`;
                    return (
                      <li
                        key={keyFila}
                        draggable
                        onDragStart={() => setArrastrandoIndice(indice)}
                        onDragEnd={() => setArrastrandoIndice(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const desde = arrastrandoIndice;
                          setArrastrandoIndice(null);
                          if (desde == null || desde === indice) return;
                          moverImagenGaleria(desde, indice);
                        }}
                        className={cn(
                          "flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-stretch",
                          indice === 0 ? "ring-1 ring-primary/30" : null,
                          arrastrandoIndice === indice ? "opacity-60" : null,
                        )}
                      >
                        <div className="flex shrink-0 gap-2 sm:flex-col sm:items-center">
                          <span
                            className="inline-flex cursor-grab touch-none items-center justify-center rounded-md border border-border bg-muted/30 px-2 py-2 text-muted-foreground active:cursor-grabbing"
                            title="Arrastrá para reordenar"
                          >
                            <GripVertical className="size-4" aria-hidden />
                          </span>
                          <div className="relative h-24 w-full overflow-hidden rounded-md border border-border bg-muted/20 sm:h-28 sm:w-28">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.src}
                              alt={img.alt || nombre}
                              className="size-full object-cover"
                            />
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {indice === 0 ? (
                              <Badge variante="success" className="text-[10px]">
                                Destacada
                              </Badge>
                            ) : (
                              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Galería
                              </span>
                            )}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground" htmlFor={`img-name-${keyFila}`}>
                                Título
                              </Label>
                              <Input
                                id={`img-name-${keyFila}`}
                                value={img.name}
                                onChange={(e) => actualizarImagenGaleria(indice, "name", e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground" htmlFor={`img-alt-${keyFila}`}>
                                Texto alternativo
                              </Label>
                              <Input
                                id={`img-alt-${keyFila}`}
                                value={img.alt}
                                onChange={(e) => actualizarImagenGaleria(indice, "alt", e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                          {img.src.startsWith("data:") ? (
                            <p className="text-[10px] text-muted-foreground">Nueva (se sube al guardar).</p>
                          ) : (
                            <p className="truncate text-[10px] text-muted-foreground" title={img.src}>
                              {img.src}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-row gap-1 sm:flex-col sm:justify-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-9"
                            disabled={indice === 0}
                            title="Subir"
                            onClick={() => moverImagenGaleria(indice, indice - 1)}
                          >
                            <ArrowUp className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-9"
                            disabled={indice >= imagenes.length - 1}
                            title="Bajar"
                            onClick={() => moverImagenGaleria(indice, indice + 1)}
                          >
                            <ArrowDown className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-9 text-destructive hover:bg-destructive/10"
                            title="Quitar de la galería"
                            onClick={() => eliminarImagenGaleria(indice)}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Categorías</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Categoría principal</p>
                {categoriaPrincipalId != null ? (
                  <Badge
                    variante="success"
                    className="h-auto max-w-full items-start gap-1.5 whitespace-normal py-2 text-left text-sm"
                  >
                    <Tag className="mt-0.5 size-3 shrink-0" />
                    <span className="min-w-0 leading-snug">
                      {etiquetaCategoriaPorId.get(categoriaPrincipalId) ??
                        `Categoría #${categoriaPrincipalId}`}
                    </span>
                  </Badge>
                ) : (
                  <Badge variante="warning">Sin categoría principal</Badge>
                )}
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <Select value={categoriaAAgregar} onValueChange={(value) => setCategoriaAAgregar(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Agregar categoría (árbol jerárquico)" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriasJerarquicas.map((op) => (
                      <SelectItem key={op.id} value={String(op.id)}>
                        {op.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="gap-2" onClick={() => {
                  const id = Number.parseInt(categoriaAAgregar, 10);
                  if (Number.isFinite(id) && id > 0) agregarCategoria(id);
                }}>
                  <Plus className="size-4" />
                  Añadir
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {categoriasSeleccionadas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay categorías asignadas.</p>
                ) : (
                  categoriasSeleccionadas.map((catId) => (
                    <button
                      key={catId}
                      type="button"
                      onClick={() => quitarCategoria(catId)}
                      className={`inline-flex max-w-full items-start gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs leading-snug ${
                        catId === categoriaPrincipalId
                          ? "border-primary/50 bg-primary/15 text-foreground"
                          : "border-border bg-background text-foreground"
                      }`}
                      title="Quitar categoría"
                    >
                      <span className="min-w-0 flex-1">
                        {etiquetaCategoriaPorId.get(catId) ?? `Categoría #${catId}`}
                      </span>
                      <X className="mt-0.5 size-3 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rentabilidad-web" className="space-y-4">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Rentabilidad Web</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-md border border-border p-3 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Precio venta web
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="woo-regular">Precio regular</Label>
                    <Input
                      id="woo-regular"
                      type="number"
                      step="0.01"
                      min="0"
                      value={regularPriceWooInput}
                      onChange={(e) => setRegularPriceWooInput(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="woo-sale">Precio de oferta</Label>
                    <Input
                      id="woo-sale"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Vacío = sin oferta"
                      value={salePriceWooInput}
                      onChange={(e) => setSalePriceWooInput(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="woo-sale-from">Inicio de la oferta</Label>
                      <Input
                        id="woo-sale-from"
                        type="date"
                        value={fechaOfertaDesde}
                        onChange={(e) => setFechaOfertaDesde(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="woo-sale-to">Fin de la oferta</Label>
                      <Input
                        id="woo-sale-to"
                        type="date"
                        value={fechaOfertaHasta}
                        onChange={(e) => setFechaOfertaHasta(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Dejá las fechas vacías para oferta sin periodo fijo. Los cambios se aplican con Guardar
                    cambios.
                  </p>
                  <div className="flex justify-between border-t border-border pt-3">
                    <span className="text-muted-foreground">Precio Web activo (vista previa)</span>
                    <div className="flex flex-col items-end">
                      {mostrarPrecioRegularTachado ? (
                        <span className="text-xs text-muted-foreground line-through">
                          {formatoMonedaGrafico(regularPriceDraft)}
                        </span>
                      ) : null}
                      <span className={cn("font-semibold", hayPrecioOfertaWeb ? "text-primary" : "text-foreground")}>
                        {Number.isFinite(precioWebActivo) && precioWebActivo > 0
                          ? formatoMonedaGrafico(precioWebActivo)
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 rounded-md border border-border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Métricas Web</p>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Ganancia Web por unidad</p>
                    <p
                      className={`text-xl font-semibold ${gananciaWeb < 0 ? "text-destructive" : "text-foreground"}`}
                    >
                      {gananciaWeb}
                    </p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Margen Web (%)</p>
                    <p className={`text-xl font-semibold ${colorPorMargen(margenPctWeb)}`}>
                      {margenPctWeb != null ? `${margenPctWeb}%` : "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Rentabilidad en el tiempo
                    </p>
                    <p className="max-w-xl text-xs text-muted-foreground">
                      Ganancia diaria aproximada: ingresos por líneas de este producto en pedidos Woo con los
                      estados configurados para analíticas (incluye transferencias en espera si los slugs coinciden
                      con tu DAC; ver .env.example) menos unidades vendidas × costo mayorista. El costo usado es el
                      del campo Costo en Rentabilidad Mayorista (valor en pantalla, sin necesidad de guardar).
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-xs font-medium text-muted-foreground">Ganancia periodo</span>
                      <span
                        className={cn(
                          "min-w-0 max-w-56 text-sm sm:max-w-64",
                          cargandoGraficasRentabilidad || gananciaTotalWebPeriodo == null
                            ? "text-muted-foreground"
                            : gananciaTotalWebPeriodo < 0
                              ? "font-semibold tabular-nums text-destructive"
                              : "font-semibold tabular-nums text-primary",
                        )}
                      >
                        {cargandoGraficasRentabilidad ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
                            <span className="text-xs font-normal">…</span>
                          </span>
                        ) : gananciaTotalWebPeriodo != null ? (
                          formatoMonedaGrafico(gananciaTotalWebPeriodo)
                        ) : serieRentabilidadError ? (
                          <span className="text-xs font-normal tabular-nums">—</span>
                        ) : (
                          <span className="text-xs font-normal leading-snug">
                            Sin ventas en este periodo
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] leading-tight text-muted-foreground">
                        Incluye periodo máximo si lo elegís en el selector.
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="preset-rent-web" className="text-xs text-muted-foreground">
                        Periodo
                      </Label>
                      <Select
                        value={presetSerieRentabilidad}
                        onValueChange={(v) => setPresetSerieRentabilidad(v as PresetRangoAnaliticasId)}
                      >
                        <SelectTrigger id="preset-rent-web" className="w-[220px]">
                          <SelectValue placeholder="Periodo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ultimos_7">Últimos 7 días</SelectItem>
                          <SelectItem value="ultimos_30">Últimos 30 días</SelectItem>
                          <SelectItem value="este_mes">Este mes</SelectItem>
                          <SelectItem value="mes_anterior">Mes anterior</SelectItem>
                          <SelectItem value="este_anio">Este año</SelectItem>
                          <SelectItem value="periodo_maximo">Periodo máximo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                {periodoRangoMuyAmplio ? (
                  <p className="rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Rango amplio:</span> Woo puede tardar{" "}
                    <span className="text-foreground">varios minutos</span> en devolver todos los pedidos. La
                    pantalla puede quedar un momento sin cambios; no cierres la pestaña ni recargues hasta que
                    termine.
                  </p>
                ) : null}
                {serieRentabilidadTruncado && !cargandoGraficasRentabilidad ? (
                  <p className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    Se alcanzó el límite de páginas al leer pedidos. Probá un rango más corto si faltan días.
                  </p>
                ) : null}
                {serieRentabilidadError ? (
                  <p className="text-sm text-destructive">{serieRentabilidadError}</p>
                ) : null}
                {cargandoGraficasRentabilidad ? (
                  <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
                    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-10 dark:bg-muted/10">
                      <Loader2 className="size-9 shrink-0 animate-spin text-primary" aria-hidden />
                      <p className="text-center text-sm font-medium text-foreground">Cargando gráfica de ganancia</p>
                      <p className="max-w-md text-center text-xs text-muted-foreground">
                        Consultando pedidos Woo y calculando la serie diaria.
                        {periodoRangoMuyAmplio ? (
                          <>
                            {" "}
                            Con este periodo la espera puede ser larga; es normal que no pase nada en pantalla al
                            principio.
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="space-y-3 border-t border-border pt-6">
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Costos en el tiempo
                        </p>
                        <p className="max-w-xl text-xs text-muted-foreground">
                          Costo mayorista según historial en Supabase (mismo rango de fechas que arriba).
                        </p>
                      </div>
                      <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-10 dark:bg-muted/10">
                        <Loader2 className="size-9 shrink-0 animate-spin text-primary" aria-hidden />
                        <p className="text-center text-sm font-medium text-foreground">Cargando gráfica de costos</p>
                        <p className="max-w-md text-center text-xs text-muted-foreground">
                          Leyendo historial de costos y armando la serie por día.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
                {!cargandoGraficasRentabilidad &&
                !serieRentabilidadError &&
                datosGraficoRentabilidadWeb.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay ventas web registradas en este periodo para este producto.
                  </p>
                ) : null}
                {!cargandoGraficasRentabilidad && datosGraficoRentabilidadWeb.length > 0 ? (
                  <div className="h-[280px] w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={datosGraficoRentabilidadWeb}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                        <XAxis dataKey="corto" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <YAxis
                          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                          tickFormatter={(v) => formatoMonedaGrafico(Number(v))}
                          width={64}
                        />
                        <Tooltip
                          formatter={(valor, nombre) => [
                            formatoMonedaGrafico(Number(valor)),
                            String(nombre),
                          ]}
                          labelFormatter={(_, payload) => {
                            const row = payload?.[0]?.payload as { dia?: string } | undefined;
                            return row?.dia ?? "";
                          }}
                          contentStyle={estiloTooltipGrafico}
                        />
                        <Area
                          type="monotone"
                          dataKey="ganancia"
                          name="Ganancia"
                          stroke="hsl(var(--primary))"
                          fill="hsl(var(--primary))"
                          fillOpacity={0.15}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}

                {!cargandoGraficasRentabilidad ? (
                  <div className="mt-6 space-y-3 border-t border-border pt-6">
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Costos en el tiempo
                      </p>
                      <p className="max-w-xl text-xs text-muted-foreground">
                        Costo mayorista registrado día a día según el historial de cambios en Supabase. Si no hay
                        movimientos en el periodo, se muestra el costo actual como línea plana. Tras guardar un
                        nuevo costo, el gráfico se actualiza al recargar la serie (cambio de periodo o guardado B2B).
                      </p>
                    </div>
                    {serieCostoError ? (
                      <p className="text-sm text-destructive">{serieCostoError}</p>
                    ) : null}
                    {serieCostoPuntos && serieCostoPuntos.length > 0 ? (
                      <div className="h-[260px] w-full pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={serieCostoPuntos}
                            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                            <XAxis dataKey="corto" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                            <YAxis
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                              tickFormatter={(v) => formatoMonedaGrafico(Number(v))}
                              width={64}
                            />
                            <Tooltip
                              formatter={(valor, nombre) => [
                                formatoMonedaGrafico(Number(valor)),
                                String(nombre),
                              ]}
                              labelFormatter={(_, payload) => {
                                const row = payload?.[0]?.payload as { dia?: string } | undefined;
                                return row?.dia ?? "";
                              }}
                              contentStyle={estiloTooltipGrafico}
                            />
                            <Line
                              type="stepAfter"
                              dataKey="costo"
                              name="Costo"
                              stroke="hsl(var(--foreground))"
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rentabilidad-mayorista" className="space-y-4">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Rentabilidad Mayorista</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estructura B2B (editable)</p>
                <div className="space-y-1.5">
                  <Label htmlFor="b2b-costo">Costo</Label>
                  <Input id="b2b-costo" type="number" step="0.01" min="0" value={precioCostoInput} onChange={(e) => setPrecioCostoInput(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b2b-precio">Precio Mayorista</Label>
                  <Input id="b2b-precio" type="number" step="0.01" min="0" value={precioMayoristaInput} onChange={(e) => setPrecioMayoristaInput(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b2b-min">Compra Mínima</Label>
                  <Input id="b2b-min" type="number" step="1" min="1" value={compraMinimaInput} onChange={(e) => setCompraMinimaInput(e.target.value)} />
                </div>
              </div>
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Métricas Mayorista</p>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Ganancia Mayorista por unidad</p>
                  <p className={`text-xl font-semibold ${gananciaMayorista < 0 ? "text-destructive" : "text-foreground"}`}>{gananciaMayorista}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Margen Mayorista (%)</p>
                  <p className={`text-xl font-semibold ${colorPorMargen(margenPctMayorista)}`}>{margenPctMayorista != null ? `${margenPctMayorista}%` : "-"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventario" className="space-y-4">
          <Card className="bg-card">
            <CardHeader><CardTitle>Stock y SKU</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-sku">SKU</Label>
                <Input id="inv-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-stock-qty">Cantidad stock</Label>
                <Input id="inv-stock-qty" type="number" step="1" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="mb-2 block">Gestionar stock</Label>
                <div className="flex items-center gap-3">
                  <Switch checked={manageStock} onCheckedChange={setManageStock} />
                  <span className="text-sm text-muted-foreground">{manageStock ? "Activado" : "Desactivado"}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Estado de stock</Label>
                <Select value={stockStatus} onValueChange={setStockStatus}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instock">instock</SelectItem>
                    <SelectItem value="outofstock">outofstock</SelectItem>
                    <SelectItem value="onbackorder">onbackorder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="avanzado" className="space-y-4">
          <Card className="bg-card">
            <CardHeader><CardTitle>Publicación y destacados</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <div><p className="font-medium">Status</p><p className="text-xs text-muted-foreground">publish / draft</p></div>
                  <Switch checked={statusPublicado} onCheckedChange={setStatusPublicado} />
                </div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <div><p className="font-medium">Featured</p><p className="text-xs text-muted-foreground">Producto destacado</p></div>
                  <Switch checked={featured} onCheckedChange={setFeatured} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardHeader><CardTitle>JSON Avanzado</CardTitle></CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="adv-meta">meta_data (JSON)</Label>
                <Textarea id="adv-meta" className="min-h-[240px] font-mono text-xs" value={metaDataJson} onChange={(e) => setMetaDataJson(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adv-attrs">attributes (JSON)</Label>
                <Textarea id="adv-attrs" className="min-h-[240px] font-mono text-xs" value={attributesJson} onChange={(e) => setAttributesJson(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
