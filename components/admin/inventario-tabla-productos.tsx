"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  SlidersHorizontal,
} from "lucide-react";

import {
  actualizarProveedorProductoAdminAction,
  actualizarStockProductoAdminAction,
  guardarCambiosInventarioBulkAction,
  guardarPrecioWebInventarioBulkAction,
  type FilaPrecioWebBulk,
  type ResultadoGuardadoInventarioBulk,
  type StockStatusWoo,
} from "@/app/(admin)/admin/actions";
import { CrearProveedorModal, type ProveedorInsertado } from "@/components/admin/crear-proveedor-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilaMayoristaUpsert } from "@/lib/inventario-mayorista-upsert";
import { cn } from "@/lib/utils";

type MayoristaFila = {
  precio_venta: number | null;
  precio_costo: number | null;
  ventas_mayorista: number | null;
  activo: boolean | null;
  proveedor_id?: string | null;
};

export type ProductoInventarioFila = {
  woo_product_id: number;
  name: string;
  sku: string | null;
  base_price: number | null;
  ventas_web: number | null;
  categoria_ids?: number[] | null;
  status: string;
  image_url: string | null;
  stock_status?: string | null;
  manage_stock?: boolean | null;
  stock_quantity?: number | null;
  mayorista: MayoristaFila | null;
};

type EdicionFila = {
  precioWeb: string;
  precioMayorista: string;
  precioCosto: string;
  activo: boolean;
  proveedorId: string;
};

type ColumnaId =
  | "foto"
  | "producto"
  | "sku"
  | "precioWeb"
  | "estadoStock"
  | "ventasWeb"
  | "ventasMayorista"
  | "proveedor"
  | "precioMayorista"
  | "costo"
  | "canalMayorista";

type ColumnaDef = {
  id: ColumnaId;
  titulo: string;
  sortable: boolean;
  align: "left" | "right";
  anchoDefault: number;
  anchoMin: number;
  anchoMax: number;
};

const COLUMNAS: ColumnaDef[] = [
  { id: "foto", titulo: "Foto", sortable: false, align: "left", anchoDefault: 72, anchoMin: 64, anchoMax: 120 },
  { id: "producto", titulo: "Producto", sortable: true, align: "left", anchoDefault: 200, anchoMin: 140, anchoMax: 400 },
  { id: "sku", titulo: "SKU", sortable: true, align: "left", anchoDefault: 120, anchoMin: 90, anchoMax: 220 },
  { id: "precioWeb", titulo: "Precio Web", sortable: true, align: "left", anchoDefault: 150, anchoMin: 120, anchoMax: 260 },
  { id: "estadoStock", titulo: "Estado stock", sortable: true, align: "left", anchoDefault: 145, anchoMin: 120, anchoMax: 260 },
  { id: "ventasWeb", titulo: "Ventas Web", sortable: true, align: "right", anchoDefault: 130, anchoMin: 100, anchoMax: 220 },
  { id: "ventasMayorista", titulo: "Ventas mayorista", sortable: true, align: "right", anchoDefault: 145, anchoMin: 120, anchoMax: 260 },
  { id: "proveedor", titulo: "Proveedor", sortable: true, align: "left", anchoDefault: 220, anchoMin: 150, anchoMax: 360 },
  { id: "precioMayorista", titulo: "Precio Mayorista", sortable: true, align: "left", anchoDefault: 170, anchoMin: 130, anchoMax: 260 },
  { id: "costo", titulo: "Costo", sortable: true, align: "left", anchoDefault: 130, anchoMin: 110, anchoMax: 220 },
  { id: "canalMayorista", titulo: "Canal Mayorista", sortable: true, align: "left", anchoDefault: 140, anchoMin: 120, anchoMax: 220 },
];

const COLUMNAS_POR_ID = new Map(COLUMNAS.map((c) => [c.id, c]));
const ORDEN_DEFAULT: ColumnaId[] = COLUMNAS.map((c) => c.id);
const ANCHOS_DEFAULT: Record<ColumnaId, number> = COLUMNAS.reduce((acc, c) => {
  acc[c.id] = c.anchoDefault;
  return acc;
}, {} as Record<ColumnaId, number>);

/** Sticky izquierda solo si Foto y Producto son las dos primeras columnas (orden por defecto). */
function propsCeldaStickyFotoProducto(
  id: ColumnaId,
  ordenColumnas: ColumnaId[],
  anchos: Record<ColumnaId, number>,
  opts: { modo: "thead" | "tbody"; sucioFila: boolean },
): { className: string; style: CSSProperties } {
  const w = anchos[id] ?? 120;
  const base: CSSProperties = { width: w, minWidth: w };
  const ordenOk = ordenColumnas[0] === "foto" && ordenColumnas[1] === "producto";
  if (!ordenOk || (id !== "foto" && id !== "producto")) {
    return { className: "", style: base };
  }
  const anchoFoto = anchos.foto ?? 72;
  const left = id === "foto" ? 0 : anchoFoto;
  const zThead = id === "foto" ? 30 : 31;
  const zBody = id === "foto" ? 20 : 21;
  const z = opts.modo === "thead" ? zThead : zBody;
  const bg =
    opts.modo === "thead"
      ? "bg-muted/40"
      : opts.sucioFila
        ? "bg-muted/15"
        : "bg-card";
  return {
    className: cn("sticky border-r border-border shadow-sm", bg),
    style: { ...base, position: "sticky", left, zIndex: z },
  };
}

function formatoEntero(valor: number) {
  return new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 }).format(valor);
}

function parseNumCampo(raw: string): number {
  const n = Number.parseFloat(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) ? n : NaN;
}

function norm2(raw: string): number {
  const n = parseNumCampo(raw);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function clampAncho(id: ColumnaId, ancho: number) {
  const meta = COLUMNAS_POR_ID.get(id);
  if (!meta) return ancho;
  return Math.min(meta.anchoMax, Math.max(meta.anchoMin, ancho));
}

type StockOverlay = {
  stock_status: string;
  manage_stock: boolean | null;
  stock_quantity: number | null;
};

function fusionarStock(p: ProductoInventarioFila, over?: StockOverlay): ProductoInventarioFila {
  if (!over) return p;
  return {
    ...p,
    stock_status: over.stock_status,
    manage_stock: over.manage_stock,
    stock_quantity: over.stock_quantity,
  };
}

function stockStatusValueParaSelect(p: ProductoInventarioFila): StockStatusWoo {
  const raw = String(p.stock_status ?? "instock").toLowerCase();
  if (raw === "outofstock") return "outofstock";
  if (raw === "onbackorder") return "onbackorder";
  return "instock";
}

function overlayOptimistaStock(status: StockStatusWoo): StockOverlay {
  if (status === "instock") {
    return { stock_status: "instock", manage_stock: false, stock_quantity: null };
  }
  if (status === "outofstock") {
    return { stock_status: "outofstock", manage_stock: true, stock_quantity: 0 };
  }
  return { stock_status: "onbackorder", manage_stock: true, stock_quantity: 0 };
}

function estadoStockEnTabla(p: ProductoInventarioFila): { texto: string; className: string } {
  const sinColumnasStock =
    p.stock_status == null && p.manage_stock == null && p.stock_quantity == null;
  if (sinColumnasStock) {
    return { texto: "—", className: "text-muted-foreground" };
  }
  const raw = String(p.stock_status ?? "instock").toLowerCase();
  const status =
    raw === "outofstock" || raw === "onbackorder" || raw === "instock" ? raw : "instock";
  const manage = Boolean(p.manage_stock);
  const qtyRaw = p.stock_quantity;
  const qty =
    qtyRaw != null && Number.isFinite(Number(qtyRaw)) ? Math.trunc(Number(qtyRaw)) : null;
  if (status === "outofstock") return { texto: "Sin stock", className: "text-destructive" };
  if (status === "onbackorder") return { texto: "Encargo", className: "text-muted-foreground" };
  if (manage && qty != null) {
    return {
      texto: `En stock (${formatoEntero(qty)})`,
      className: qty > 0 ? "text-foreground" : "text-destructive",
    };
  }
  return { texto: "En stock", className: "text-foreground" };
}

function construirEdicionDesdeProducto(p: ProductoInventarioFila): EdicionFila {
  const precioWoo = Number(p.base_price ?? 0);
  const pm = p.mayorista?.precio_venta ?? precioWoo;
  const pc = p.mayorista?.precio_costo ?? 0;
  return {
    precioWeb: String(precioWoo),
    precioMayorista: String(pm),
    precioCosto: String(pc),
    activo: Boolean(p.mayorista?.activo),
    proveedorId: p.mayorista?.proveedor_id ?? SIN_PROVEEDOR,
  };
}

function edicionesIguales(a: EdicionFila, b: EdicionFila): boolean {
  return (
    norm2(a.precioWeb) === norm2(b.precioWeb) &&
    norm2(a.precioMayorista) === norm2(b.precioMayorista) &&
    norm2(a.precioCosto) === norm2(b.precioCosto) &&
    a.activo === b.activo
  );
}

function clonarEdiciones(fuente: Record<number, EdicionFila>): Record<number, EdicionFila> {
  const out: Record<number, EdicionFila> = {};
  for (const k of Object.keys(fuente)) {
    const id = Number(k);
    out[id] = { ...fuente[id] };
  }
  return out;
}

function construirMapaInicial(productos: ProductoInventarioFila[]): Record<number, EdicionFila> {
  const m: Record<number, EdicionFila> = {};
  for (const p of productos) {
    m[p.woo_product_id] = construirEdicionDesdeProducto(p);
  }
  return m;
}

function cmpNumero(a: number, b: number) {
  return a === b ? 0 : a > b ? 1 : -1;
}

function cmpTexto(a: string, b: string) {
  return a.localeCompare(b, "es", { sensitivity: "base" });
}

type Props = {
  productos: ProductoInventarioFila[];
  proveedores: { id: string; nombre_fantasia: string }[];
  resetKey: string;
  onProveedorCreado?: (proveedor: ProveedorInsertado) => void;
};

const SIN_PROVEEDOR = "__sin_proveedor__";

export function InventarioTablaProductos({
  productos,
  proveedores,
  resetKey,
  onProveedorCreado,
}: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [pendienteProveedor, startTransitionProveedor] = useTransition();
  const [pendienteStock, startTransitionStock] = useTransition();
  const [inicial, setInicial] = useState<Record<number, EdicionFila>>(() =>
    construirMapaInicial(productos),
  );
  const [ediciones, setEdiciones] = useState<Record<number, EdicionFila>>(() =>
    construirMapaInicial(productos),
  );
  const [mensaje, setMensaje] = useState<ResultadoGuardadoInventarioBulk | null>(null);
  const [sortBy, setSortBy] = useState<ColumnaId>("ventasWeb");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [mostrarEditorColumnas, setMostrarEditorColumnas] = useState(false);
  const [ordenColumnas, setOrdenColumnas] = useState<ColumnaId[]>(ORDEN_DEFAULT);
  const [anchosColumnas, setAnchosColumnas] = useState<Record<ColumnaId, number>>(ANCHOS_DEFAULT);
  const [errorProveedor, setErrorProveedor] = useState<string | null>(null);
  const [errorStock, setErrorStock] = useState<string | null>(null);
  const [stockLocal, setStockLocal] = useState<Record<number, StockOverlay>>({});
  const [modalCrearProveedorAbierto, setModalCrearProveedorAbierto] = useState(false);
  const [wooProductIdProveedorNuevo, setWooProductIdProveedorNuevo] = useState<number | null>(null);

  const nombreProveedorPorId = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const proveedor of proveedores) {
      mapa.set(proveedor.id, proveedor.nombre_fantasia);
    }
    return mapa;
  }, [proveedores]);

  useEffect(() => {
    const next = construirMapaInicial(productos);
    setInicial(next);
    setEdiciones(next);
    setMensaje(null);
    setErrorProveedor(null);
    setErrorStock(null);
    setStockLocal({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    setStockLocal((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const id = Number(key);
        const p = productos.find((x) => x.woo_product_id === id);
        if (!p) continue;
        const over = next[id];
        const mismoStatus =
          String(p.stock_status ?? "").toLowerCase() === String(over.stock_status ?? "").toLowerCase();
        const mismoManage = Boolean(p.manage_stock) === Boolean(over.manage_stock);
        const pq = p.stock_quantity;
        const oq = over.stock_quantity;
        const mismoQty =
          (pq == null && oq == null) ||
          (pq != null && oq != null && Math.trunc(Number(pq)) === Math.trunc(Number(oq)));
        if (mismoStatus && mismoManage && mismoQty) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [productos]);

  useEffect(() => {
    try {
      const rawOrden = window.localStorage.getItem("admin.inventario.col-order.v1");
      const rawAnchos = window.localStorage.getItem("admin.inventario.col-widths.v1");
      if (rawOrden) {
        const parsed = JSON.parse(rawOrden) as unknown;
        if (Array.isArray(parsed)) {
          const limpios = parsed.filter((x): x is ColumnaId =>
            ORDEN_DEFAULT.includes(String(x) as ColumnaId),
          );
          if (limpios.length === ORDEN_DEFAULT.length) {
            setOrdenColumnas(limpios);
          }
        }
      }
      if (rawAnchos) {
        const parsed = JSON.parse(rawAnchos) as Record<string, unknown>;
        const next = { ...ANCHOS_DEFAULT };
        for (const id of ORDEN_DEFAULT) {
          const v = Number(parsed[id]);
          if (Number.isFinite(v)) next[id] = clampAncho(id, Math.round(v));
        }
        setAnchosColumnas(next);
      }
    } catch {
      // ignore local storage parse errors
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("admin.inventario.col-order.v1", JSON.stringify(ordenColumnas));
  }, [ordenColumnas]);

  useEffect(() => {
    window.localStorage.setItem("admin.inventario.col-widths.v1", JSON.stringify(anchosColumnas));
  }, [anchosColumnas]);

  const totalAnchoTabla = useMemo(() => {
    const base = ordenColumnas.reduce((acc, id) => acc + (anchosColumnas[id] ?? 120), 0);
    return Math.max(1320, base);
  }, [ordenColumnas, anchosColumnas]);

  const tablaScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const topSizerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tablaOverflowX, setTablaOverflowX] = useState(false);
  const [scrollAtStart, setScrollAtStart] = useState(true);
  const [scrollAtEnd, setScrollAtEnd] = useState(true);

  const refreshScrollState = useCallback(() => {
    const el = tablaScrollRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 1;
    setTablaOverflowX(overflow);
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    setScrollAtStart(el.scrollLeft <= 2);
    setScrollAtEnd(!overflow || el.scrollLeft >= max - 2);
  }, []);

  const handleMainScroll = useCallback(() => {
    const main = tablaScrollRef.current;
    const top = topScrollRef.current;
    if (main && top && top.scrollLeft !== main.scrollLeft) {
      top.scrollLeft = main.scrollLeft;
    }
    refreshScrollState();
  }, [refreshScrollState]);

  const handleTopScroll = useCallback(() => {
    const main = tablaScrollRef.current;
    const top = topScrollRef.current;
    if (main && top && top.scrollLeft !== main.scrollLeft) {
      main.scrollLeft = top.scrollLeft;
    }
    refreshScrollState();
  }, [refreshScrollState]);

  useLayoutEffect(() => {
    const main = tablaScrollRef.current;
    const topSizer = topSizerRef.current;
    const table = tableRef.current;
    if (!main || !topSizer) return;
    const applySizer = () => {
      topSizer.style.width = `${main.scrollWidth}px`;
      refreshScrollState();
    };
    applySizer();
    const ro = new ResizeObserver(applySizer);
    ro.observe(main);
    if (table) ro.observe(table);
    return () => ro.disconnect();
  }, [refreshScrollState, totalAnchoTabla, productos, ordenColumnas, anchosColumnas]);

  function scrollTablaHorizontal(delta: number) {
    tablaScrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  const productosOrdenados = useMemo(() => {
    const copia = [...productos];
    copia.sort((a, b) => {
      const ea = ediciones[a.woo_product_id] ?? construirEdicionDesdeProducto(a);
      const eb = ediciones[b.woo_product_id] ?? construirEdicionDesdeProducto(b);
      let cmp = 0;
      switch (sortBy) {
        case "producto":
          cmp = cmpTexto(a.name, b.name);
          break;
        case "sku":
          cmp = cmpTexto(a.sku ?? "", b.sku ?? "");
          break;
        case "precioWeb":
          cmp = cmpNumero(norm2(ea.precioWeb), norm2(eb.precioWeb));
          break;
        case "estadoStock": {
          const pa = fusionarStock(a, stockLocal[a.woo_product_id]);
          const pb = fusionarStock(b, stockLocal[b.woo_product_id]);
          cmp = cmpTexto(estadoStockEnTabla(pa).texto, estadoStockEnTabla(pb).texto);
          break;
        }
        case "ventasWeb":
          cmp = cmpNumero(Number(a.ventas_web ?? 0), Number(b.ventas_web ?? 0));
          break;
        case "ventasMayorista":
          cmp = cmpNumero(
            Number(a.mayorista?.ventas_mayorista ?? 0),
            Number(b.mayorista?.ventas_mayorista ?? 0),
          );
          break;
        case "proveedor":
          cmp = cmpTexto(
            ea.proveedorId === SIN_PROVEEDOR
              ? ""
              : (nombreProveedorPorId.get(ea.proveedorId) ?? ""),
            eb.proveedorId === SIN_PROVEEDOR
              ? ""
              : (nombreProveedorPorId.get(eb.proveedorId) ?? ""),
          );
          break;
        case "precioMayorista":
          cmp = cmpNumero(norm2(ea.precioMayorista), norm2(eb.precioMayorista));
          break;
        case "costo":
          cmp = cmpNumero(norm2(ea.precioCosto), norm2(eb.precioCosto));
          break;
        case "canalMayorista":
          cmp = cmpNumero(Number(ea.activo), Number(eb.activo));
          break;
        default:
          cmp = cmpNumero(a.woo_product_id, b.woo_product_id);
      }
      if (cmp === 0) cmp = cmpNumero(a.woo_product_id, b.woo_product_id);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copia;
  }, [productos, ediciones, sortBy, sortDir, nombreProveedorPorId, stockLocal]);

  const numCambios = useMemo(() => {
    let n = 0;
    for (const p of productos) {
      const id = p.woo_product_id;
      const cur = ediciones[id];
      const ini = inicial[id];
      if (!cur || !ini) continue;
      if (!edicionesIguales(cur, ini)) n += 1;
    }
    return n;
  }, [productos, ediciones, inicial]);

  function setCampo(id: number, parcial: Partial<EdicionFila>) {
    setEdiciones((prev) => {
      const base = prev[id];
      if (!base) return prev;
      return { ...prev, [id]: { ...base, ...parcial } };
    });
    setMensaje(null);
  }

  function cambioMayorista(ini: EdicionFila, cur: EdicionFila) {
    return (
      norm2(ini.precioMayorista) !== norm2(cur.precioMayorista) ||
      norm2(ini.precioCosto) !== norm2(cur.precioCosto) ||
      ini.activo !== cur.activo
    );
  }

  function cambioPrecioWeb(ini: EdicionFila, cur: EdicionFila) {
    return norm2(ini.precioWeb) !== norm2(cur.precioWeb);
  }

  function armarPayloadsMayorista(): FilaMayoristaUpsert[] {
    const items: FilaMayoristaUpsert[] = [];
    for (const p of productos) {
      const id = p.woo_product_id;
      const cur = ediciones[id];
      const ini = inicial[id];
      if (!cur || !ini || !cambioMayorista(ini, cur)) continue;
      const precioWoo = Number(p.base_price ?? 0);
      const pm = parseNumCampo(cur.precioMayorista);
      const pc = parseNumCampo(cur.precioCosto);
      const precioMayorista = Number.isFinite(pm) && pm >= 0 ? pm : precioWoo;
      const precioCosto = Number.isFinite(pc) && pc >= 0 ? pc : 0;
      items.push({
        woo_product_id: id,
        nombre: p.name,
        sku: p.sku,
        precio_base_woo: precioWoo,
        precio_mayorista: precioMayorista,
        precio_costo: precioCosto,
        ventas_mayorista: Number(p.mayorista?.ventas_mayorista ?? 0),
        activo: cur.activo,
      });
    }
    return items;
  }

  function armarPayloadsPrecioWeb(): FilaPrecioWebBulk[] {
    const items: FilaPrecioWebBulk[] = [];
    for (const p of productos) {
      const id = p.woo_product_id;
      const cur = ediciones[id];
      const ini = inicial[id];
      if (!cur || !ini || !cambioPrecioWeb(ini, cur)) continue;
      const n = parseNumCampo(cur.precioWeb);
      if (!Number.isFinite(n) || n < 0) continue;
      items.push({ woo_product_id: id, precio_web: Number(n.toFixed(2)) });
    }
    return items;
  }

  function moverColumna(id: ColumnaId, delta: -1 | 1) {
    setOrdenColumnas((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[nextIdx]] = [arr[nextIdx], arr[idx]];
      return arr;
    });
  }

  function guardar() {
    const itemsMayorista = armarPayloadsMayorista();
    const itemsPrecioWeb = armarPayloadsPrecioWeb();
    if (itemsMayorista.length === 0 && itemsPrecioWeb.length === 0) return;

    startTransition(async () => {
      setMensaje(null);
      let guardados = 0;
      if (itemsPrecioWeb.length > 0) {
        const resWeb = await guardarPrecioWebInventarioBulkAction(itemsPrecioWeb);
        if (!resWeb.ok) {
          setMensaje(resWeb);
          return;
        }
        guardados += resWeb.guardados;
      }
      if (itemsMayorista.length > 0) {
        const resMay = await guardarCambiosInventarioBulkAction(itemsMayorista);
        if (!resMay.ok) {
          setMensaje(resMay);
          return;
        }
        guardados += resMay.guardados;
      }
      setMensaje({ ok: true, guardados });
      setInicial(clonarEdiciones(ediciones));
      router.refresh();
    });
  }

  function actualizarProveedorFila(wooProductId: number, proveedorIdDraft: string) {
    setCampo(wooProductId, { proveedorId: proveedorIdDraft });
    setErrorProveedor(null);

    startTransitionProveedor(async () => {
      const proveedorId = proveedorIdDraft === SIN_PROVEEDOR ? null : proveedorIdDraft;
      const res = await actualizarProveedorProductoAdminAction(wooProductId, proveedorId);
      if (!res.ok) {
        const valorInicial = inicial[wooProductId]?.proveedorId ?? SIN_PROVEEDOR;
        setCampo(wooProductId, { proveedorId: valorInicial });
        setErrorProveedor(res.error);
        return;
      }
      setInicial((prev) => {
        const base = prev[wooProductId];
        if (!base) return prev;
        return {
          ...prev,
          [wooProductId]: {
            ...base,
            proveedorId: res.proveedor_id ?? SIN_PROVEEDOR,
          },
        };
      });
      router.refresh();
    });
  }

  function actualizarStockFila(wooProductId: number, value: StockStatusWoo) {
    const base = productos.find((p) => p.woo_product_id === wooProductId);
    if (!base) return;
    const fusionado = fusionarStock(base, stockLocal[wooProductId]);
    if (stockStatusValueParaSelect(fusionado) === value) return;

    setErrorStock(null);
    setStockLocal((prev) => ({
      ...prev,
      [wooProductId]: overlayOptimistaStock(value),
    }));

    startTransitionStock(async () => {
      const res = await actualizarStockProductoAdminAction(wooProductId, value);
      if (!res.ok) {
        setStockLocal((prev) => {
          const n = { ...prev };
          delete n[wooProductId];
          return n;
        });
        setErrorStock(res.error);
        return;
      }
      setStockLocal((prev) => ({
        ...prev,
        [wooProductId]: {
          stock_status: res.stock_status,
          manage_stock: res.manage_stock,
          stock_quantity: res.stock_quantity,
        },
      }));
      router.refresh();
    });
  }

  function alternarOrden(col: ColumnaDef) {
    if (!col.sortable) return;
    if (sortBy === col.id) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(col.id);
    setSortDir(col.id === "ventasWeb" ? "desc" : "asc");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMostrarEditorColumnas((v) => !v)}
            className="gap-2"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Columnas
          </Button>
          {tablaOverflowX ? (
            <div
              className="flex items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5"
              title="Desplazar la tabla sin bajar al final"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-foreground"
                disabled={scrollAtStart}
                onClick={() => {
                  const w = tablaScrollRef.current?.clientWidth ?? 320;
                  scrollTablaHorizontal(-Math.max(240, Math.round(w * 0.65)));
                }}
                aria-label="Desplazar tabla hacia la izquierda"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-foreground"
                disabled={scrollAtEnd}
                onClick={() => {
                  const w = tablaScrollRef.current?.clientWidth ?? 320;
                  scrollTablaHorizontal(Math.max(240, Math.round(w * 0.65)));
                }}
                aria-label="Desplazar tabla hacia la derecha"
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Orden actual: {sortBy === "ventasWeb" ? "Ventas Web" : (COLUMNAS_POR_ID.get(sortBy)?.titulo ?? sortBy)}{" "}
            {sortDir === "asc" ? "↑" : "↓"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {numCambios > 0 ? (
            <Button type="button" onClick={guardar} disabled={pendiente} size="sm">
              {pendiente ? "Guardando…" : "Guardar cambios"}
            </Button>
          ) : null}
          {mensaje?.ok === false ? (
            <p className="max-w-xl text-sm text-destructive" role="alert">
              {mensaje.error}
            </p>
          ) : null}
          {mensaje?.ok === true ? (
            <p className="text-sm text-muted-foreground" role="status">
              Se guardaron {mensaje.guardados} cambio(s).
            </p>
          ) : null}
          {errorProveedor ? (
            <p className="max-w-xl text-sm text-destructive" role="alert">
              {errorProveedor}
            </p>
          ) : null}
          {errorStock ? (
            <p className="max-w-xl text-sm text-destructive" role="alert">
              {errorStock}
            </p>
          ) : null}
        </div>
      </div>

      {mostrarEditorColumnas ? (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="mb-3 text-xs text-muted-foreground">
            Reordená columnas con flechas y ajustá ancho.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {ordenColumnas.map((id) => {
              const c = COLUMNAS_POR_ID.get(id)!;
              return (
                <div key={id} className="rounded-md border border-border bg-card p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{c.titulo}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => moverColumna(id, -1)}
                        aria-label={`Mover ${c.titulo} a la izquierda`}
                      >
                        <ChevronLeft className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => moverColumna(id, 1)}
                        aria-label={`Mover ${c.titulo} a la derecha`}
                      >
                        <ChevronRight className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="range"
                      min={c.anchoMin}
                      max={c.anchoMax}
                      step={2}
                      value={anchosColumnas[id]}
                      onChange={(e) =>
                        setAnchosColumnas((prev) => ({
                          ...prev,
                          [id]: clampAncho(id, Number(e.target.value)),
                        }))
                      }
                      className="w-full accent-primary"
                      aria-label={`Ancho de columna ${c.titulo}`}
                    />
                    <span className="w-12 text-right text-xs text-muted-foreground">
                      {anchosColumnas[id]}px
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border">
        <div
          ref={topScrollRef}
          onScroll={handleTopScroll}
          className={cn(
            "overflow-x-auto border-b border-border bg-muted/25",
            !tablaOverflowX && "hidden",
          )}
          aria-hidden={!tablaOverflowX}
        >
          <div ref={topSizerRef} className="h-2.5 shrink-0" />
        </div>
        <div
          ref={tablaScrollRef}
          onScroll={handleMainScroll}
          className="overflow-x-auto scroll-smooth"
        >
          <table
            ref={tableRef}
            className="w-full border-separate border-spacing-0 text-sm"
            style={{ minWidth: totalAnchoTabla }}
          >
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              {ordenColumnas.map((id) => {
                const col = COLUMNAS_POR_ID.get(id)!;
                const activo = sortBy === id;
                const sticky = propsCeldaStickyFotoProducto(id, ordenColumnas, anchosColumnas, {
                  modo: "thead",
                  sucioFila: false,
                });
                return (
                  <th
                    key={id}
                    className={cn(
                      "px-4 py-3 font-medium",
                      col.align === "right" ? "text-right" : "text-left",
                      sticky.className,
                    )}
                    style={sticky.style}
                  >
                    <button
                      type="button"
                      disabled={!col.sortable}
                      onClick={() => alternarOrden(col)}
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        col.sortable
                          ? "text-muted-foreground hover:text-foreground"
                          : "cursor-default text-muted-foreground",
                      )}
                    >
                      <span>{col.titulo}</span>
                      {col.sortable ? (
                        activo ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="size-3.5" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3.5" aria-hidden />
                          )
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-60" aria-hidden />
                        )
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {productosOrdenados.map((producto) => {
              const ed = ediciones[producto.woo_product_id] ?? construirEdicionDesdeProducto(producto);
              const ventasWeb = Math.max(0, Math.trunc(Number(producto.ventas_web ?? 0)));
              const ventasMayorista = Math.max(
                0,
                Math.trunc(Number(producto.mayorista?.ventas_mayorista ?? 0)),
              );
              const productoStock = fusionarStock(producto, stockLocal[producto.woo_product_id]);
              const stockVista = estadoStockEnTabla(productoStock);
              const stockSelectValue = stockStatusValueParaSelect(productoStock);
              const sucio =
                inicial[producto.woo_product_id] &&
                !edicionesIguales(ed, inicial[producto.woo_product_id]);
              return (
                <tr
                  key={producto.woo_product_id}
                  className={cn(
                    "border-t border-border/80",
                    sucio && "bg-muted/15",
                  )}
                >
                  {ordenColumnas.map((id) => {
                    const sticky = propsCeldaStickyFotoProducto(id, ordenColumnas, anchosColumnas, {
                      modo: "tbody",
                      sucioFila: Boolean(sucio),
                    });
                    if (id === "foto") {
                      return (
                        <td key={id} className={cn("px-4 py-3", sticky.className)} style={sticky.style}>
                          <div className="size-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted/30">
                            {producto.image_url ? (
                              <Image
                                src={producto.image_url}
                                alt={producto.name}
                                width={40}
                                height={40}
                                className="h-full w-full object-cover"
                                unoptimized
                              />
                            ) : null}
                          </div>
                        </td>
                      );
                    }
                    if (id === "producto") {
                      return (
                        <td
                          key={id}
                          className={cn("min-w-0 px-4 py-3 font-medium", sticky.className)}
                          style={sticky.style}
                        >
                          <Link
                            href={`/admin/inventario/${producto.woo_product_id}`}
                            className="block truncate text-foreground hover:underline"
                            title={producto.name}
                          >
                            {producto.name}
                          </Link>
                        </td>
                      );
                    }
                    if (id === "sku") {
                      return (
                        <td key={id} className={cn("px-4 py-3 text-muted-foreground", sticky.className)} style={sticky.style}>
                          {producto.sku ?? "-"}
                        </td>
                      );
                    }
                    if (id === "precioWeb") {
                      return (
                        <td key={id} className={cn("px-4 py-3", sticky.className)} style={sticky.style}>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={ed.precioWeb}
                            onChange={(e) =>
                              setCampo(producto.woo_product_id, { precioWeb: e.target.value })
                            }
                            className="max-w-[140px]"
                            aria-label="Precio web"
                          />
                        </td>
                      );
                    }
                    if (id === "estadoStock") {
                      return (
                        <td key={id} className={cn("px-4 py-3", sticky.className)} style={sticky.style}>
                          <Select
                            value={stockSelectValue}
                            onValueChange={(v) =>
                              actualizarStockFila(producto.woo_product_id, v as StockStatusWoo)
                            }
                            disabled={pendienteStock}
                          >
                            <SelectTrigger
                              className={cn("max-w-[200px] font-normal", stockVista.className)}
                              aria-label="Estado de stock (WooCommerce)"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              <SelectItem value="instock">En stock</SelectItem>
                              <SelectItem value="outofstock">Sin stock</SelectItem>
                              <SelectItem value="onbackorder">Encargo</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      );
                    }
                    if (id === "ventasWeb") {
                      return (
                        <td
                          key={id}
                          className={cn("px-4 py-3 text-right tabular-nums text-muted-foreground", sticky.className)}
                          style={sticky.style}
                        >
                          {formatoEntero(ventasWeb)}
                        </td>
                      );
                    }
                    if (id === "ventasMayorista") {
                      return (
                        <td
                          key={id}
                          className={cn("px-4 py-3 text-right tabular-nums text-muted-foreground", sticky.className)}
                          style={sticky.style}
                        >
                          {formatoEntero(ventasMayorista)}
                        </td>
                      );
                    }
                    if (id === "proveedor") {
                      return (
                        <td key={id} className={cn("px-4 py-3", sticky.className)} style={sticky.style}>
                          <Select
                            value={ed.proveedorId}
                            onValueChange={(value) =>
                              actualizarProveedorFila(producto.woo_product_id, value)
                            }
                            disabled={pendienteProveedor}
                          >
                            <SelectTrigger className="max-w-[220px]">
                              <SelectValue placeholder="Sin proveedor" />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              <SelectItem value={SIN_PROVEEDOR}>Sin proveedor</SelectItem>
                              {proveedores.map((proveedor) => (
                                <SelectItem key={proveedor.id} value={proveedor.id}>
                                  {proveedor.nombre_fantasia}
                                </SelectItem>
                              ))}
                              <SelectSeparator />
                              <div className="p-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="w-full justify-start gap-2 font-normal"
                                  onPointerDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setWooProductIdProveedorNuevo(producto.woo_product_id);
                                    setModalCrearProveedorAbierto(true);
                                  }}
                                >
                                  <Plus className="size-4 shrink-0 text-primary" aria-hidden />
                                  Crear proveedor…
                                </Button>
                              </div>
                            </SelectContent>
                          </Select>
                        </td>
                      );
                    }
                    if (id === "precioMayorista") {
                      return (
                        <td key={id} className={cn("px-4 py-3", sticky.className)} style={sticky.style}>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={ed.precioMayorista}
                            onChange={(e) =>
                              setCampo(producto.woo_product_id, {
                                precioMayorista: e.target.value,
                              })
                            }
                            className="max-w-[140px]"
                            aria-label="Precio mayorista"
                          />
                        </td>
                      );
                    }
                    if (id === "costo") {
                      return (
                        <td key={id} className={cn("px-4 py-3", sticky.className)} style={sticky.style}>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={ed.precioCosto}
                            onChange={(e) =>
                              setCampo(producto.woo_product_id, { precioCosto: e.target.value })
                            }
                            className="max-w-[120px]"
                            aria-label="Costo mayorista"
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={id} className={cn("px-4 py-3", sticky.className)} style={sticky.style}>
                        <input
                          type="checkbox"
                          checked={ed.activo}
                          onChange={(e) =>
                            setCampo(producto.woo_product_id, { activo: e.target.checked })
                          }
                          className="h-4 w-4 rounded border border-input bg-background"
                          aria-label="Publicado en canal mayorista"
                        />
                        {producto.status !== "publish" ? (
                          <p className="mt-1 text-xs text-muted-foreground">No publicado en Woo</p>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Tip: tocá el título de una columna para alternar orden ascendente/descendente. Si la tabla es
        ancha, usá la barra de desplazamiento arriba o las flechas junto a «Columnas». Con Foto y
        Producto como primeras dos columnas, quedan fijas al desplazar horizontalmente.
      </p>

      <CrearProveedorModal
        open={modalCrearProveedorAbierto}
        onOpenChange={(abierto) => {
          setModalCrearProveedorAbierto(abierto);
          if (!abierto) {
            setWooProductIdProveedorNuevo(null);
          }
        }}
        onCreado={(proveedor) => {
          onProveedorCreado?.(proveedor);
          if (wooProductIdProveedorNuevo != null) {
            actualizarProveedorFila(wooProductIdProveedorNuevo, proveedor.id);
          }
        }}
        descripcion="Al guardar, el proveedor quedará asignado a la fila del inventario donde abriste el menú."
      />
    </div>
  );
}
