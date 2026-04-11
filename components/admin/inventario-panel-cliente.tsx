"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Loader2,
  type LucideIcon,
  Search,
  Truck,
  Hash,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProveedorInsertado } from "@/components/admin/crear-proveedor-modal";
import {
  InventarioTablaProductos,
  type ProductoInventarioFila,
} from "@/components/admin/inventario-tabla-productos";
import { cn } from "@/lib/utils";
import { parseAlertasInventarioParam } from "@/lib/inventario-admin-data";
import type { InventoryHealthAlertKey } from "@/lib/inventory-health-evaluate";
import {
  construirQueryInventario,
  type OrdenInventario,
  type PageSizeInventario,
} from "@/lib/inventario-url";

const PAGE_SIZE_DEFAULT: PageSizeInventario = "20";
const DEBOUNCE_MS = 400;

export type CategoriaFiltroInventario = {
  id: number;
  nombre: string;
  idPadre: number;
};

export type ProveedorInventarioOpcion = {
  id: string;
  nombre_fantasia: string;
};

type RespuestaApiInventario =
  | {
      ok: true;
      productos: ProductoInventarioFila[];
      proveedores: ProveedorInventarioOpcion[];
      total: number;
      totalPages: number;
      page: number;
      pageSize: PageSizeInventario;
      inicioRango: number;
    }
  | { ok: false; error: string };

type RespuestaApiInventarioHealth =
  | {
      ok: true;
      totals: Record<InventoryHealthAlertKey, number>;
      byRootCategory: Record<string, number>;
    }
  | { ok: false; error: string };

type HealthFilterChip = {
  id: InventoryHealthAlertKey;
  label: string;
  icon: LucideIcon;
  className: string;
  activeClassName: string;
};

const HEALTH_CHIPS: HealthFilterChip[] = [
  {
    id: "sinStock",
    label: "Sin Stock",
    icon: AlertTriangle,
    className: "border-destructive/40 text-destructive hover:bg-destructive/10",
    activeClassName: "border-destructive bg-destructive/15 text-destructive",
  },
  {
    id: "sinCosto",
    label: "Sin Costo",
    icon: AlertCircle,
    className: "border-border text-foreground hover:bg-muted/60",
    activeClassName: "border-primary bg-primary/10 text-primary",
  },
  {
    id: "sinSku",
    label: "Sin SKU",
    icon: Hash,
    className: "border-border text-primary hover:bg-primary/10",
    activeClassName: "border-primary bg-primary/15 text-primary",
  },
  {
    id: "sinProveedor",
    label: "Sin Proveedor",
    icon: Truck,
    className: "border-border text-muted-foreground hover:bg-muted/60",
    activeClassName: "border-border bg-muted/80 text-foreground",
  },
];

export function InventarioPanelCliente({
  categorias,
}: {
  categorias: CategoriaFiltroInventario[];
}) {
  const router = useRouter();
  const parametros = useSearchParams();
  const categoriaActual = parametros.get("categoria") ?? "";
  const subcategoriaActual = parametros.get("subcategoria") ?? "";
  const mayoristaUrl =
    parametros.get("mayorista") === "si" || parametros.get("mayorista") === "no"
      ? (parametros.get("mayorista") as "si" | "no")
      : ("" as const);
  const ordenActual: OrdenInventario =
    parametros.get("orden") === "ventas_web" ? "ventas_web" : "woo_id";
  const paginaInventario = Math.max(
    1,
    Number.parseInt(parametros.get("page") ?? "1", 10) || 1,
  );
  const pageSizeParam: PageSizeInventario =
    parametros.get("pageSize") === "50" ||
    parametros.get("pageSize") === "100" ||
    parametros.get("pageSize") === "max"
      ? (parametros.get("pageSize") as PageSizeInventario)
      : PAGE_SIZE_DEFAULT;
  const qUrl = parametros.get("q") ?? "";
  const alertasQueryParam = (parametros.get("alertas") ?? "").trim();
  const alertasParaUrl = alertasQueryParam || undefined;
  const alertasFiltroLista = useMemo(
    () => parseAlertasInventarioParam(alertasQueryParam || null),
    [alertasQueryParam],
  );

  const idsConocidos = useMemo(
    () => new Set(categorias.map((categoria) => categoria.id)),
    [categorias],
  );

  const raices = useMemo(() => {
    return categorias
      .filter(
        (categoria) => categoria.idPadre === 0 || !idsConocidos.has(categoria.idPadre),
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [categorias, idsConocidos]);

  const subcategorias = useMemo(() => {
    if (!categoriaActual) {
      return [];
    }
    const idPadre = Number.parseInt(categoriaActual, 10);
    return categorias
      .filter((categoria) => categoria.idPadre === idPadre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [categorias, categoriaActual]);

  const [inputQ, setInputQ] = useState(qUrl);
  const [debouncedQ, setDebouncedQ] = useState(qUrl);
  const [productos, setProductos] = useState<ProductoInventarioFila[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorInventarioOpcion[]>([]);
  const [pageSizeActual, setPageSizeActual] = useState<PageSizeInventario>(pageSizeParam);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [inicioRango, setInicioRango] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeSync, setMensajeSync] = useState<string | null>(null);
  const [saludCatalogo, setSaludCatalogo] = useState<{
    totals: Record<InventoryHealthAlertKey, number>;
    byRootCategory: Record<string, number>;
  } | null>(null);
  const [saludCatalogoCargando, setSaludCatalogoCargando] = useState(false);
  const [saludCatalogoError, setSaludCatalogoError] = useState<string | null>(null);
  const [saludCatalogoTick, setSaludCatalogoTick] = useState(0);

  useEffect(() => {
    if (categorias.length === 0) {
      setSaludCatalogo(null);
      setSaludCatalogoCargando(false);
      setSaludCatalogoError(null);
      return;
    }
    const controlador = new AbortController();
    setSaludCatalogoCargando(true);
    setSaludCatalogoError(null);
    const urlSalud = new URL("/api/admin/inventario/health", window.location.origin);
    if (categoriaActual.trim()) {
      urlSalud.searchParams.set("categoria", categoriaActual);
    }
    if (subcategoriaActual.trim()) {
      urlSalud.searchParams.set("subcategoria", subcategoriaActual);
    }
    void fetch(urlSalud.toString(), {
      signal: controlador.signal,
      credentials: "same-origin",
    })
      .then(async (respuesta) => {
        const cuerpo = (await respuesta.json()) as RespuestaApiInventarioHealth;
        if (!respuesta.ok || !cuerpo.ok) {
          throw new Error(!cuerpo.ok ? cuerpo.error : "No se pudo cargar el estado del catálogo.");
        }
        setSaludCatalogo({
          totals: cuerpo.totals,
          byRootCategory: cuerpo.byRootCategory,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setSaludCatalogo(null);
        setSaludCatalogoError(
          error instanceof Error ? error.message : "Error al cargar alertas globales.",
        );
      })
      .finally(() => {
        if (!controlador.signal.aborted) {
          setSaludCatalogoCargando(false);
        }
      });
    return () => controlador.abort();
  }, [categorias.length, saludCatalogoTick, categoriaActual, subcategoriaActual]);

  useEffect(() => {
    setInputQ(qUrl);
    setDebouncedQ(qUrl);
  }, [qUrl]);

  useEffect(() => {
    setPageSizeActual(pageSizeParam);
  }, [pageSizeParam]);

  useEffect(() => {
    const idTimer = window.setTimeout(() => {
      setDebouncedQ(inputQ);
      const trim = inputQ.trim();
      const trimUrl = qUrl.trim();
      if (trim !== trimUrl) {
        router.replace(
          construirQueryInventario({
            page: 1,
            categoria: categoriaActual || undefined,
            subcategoria: subcategoriaActual || undefined,
            mayorista: mayoristaUrl,
            orden: ordenActual,
            pageSize: pageSizeParam,
            q: trim || undefined,
            alertas: alertasParaUrl,
          }),
        );
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(idTimer);
  }, [
    inputQ,
    qUrl,
    router,
    categoriaActual,
    subcategoriaActual,
    mayoristaUrl,
    ordenActual,
    pageSizeParam,
    alertasParaUrl,
  ]);

  /** Listado desde `woo_product_cache` aunque `woo_category_cache` esté vacío. */
  useEffect(() => {
    const controlador = new AbortController();
    setCargando(true);
    setErrorCarga(null);

    const url = new URL("/api/admin/inventario/query", window.location.origin);
    url.searchParams.set("page", String(paginaInventario));
    url.searchParams.set("pageSize", pageSizeParam);
    if (categoriaActual.trim()) {
      url.searchParams.set("categoria", categoriaActual);
    }
    if (subcategoriaActual.trim()) {
      url.searchParams.set("subcategoria", subcategoriaActual);
    }
    if (mayoristaUrl === "si" || mayoristaUrl === "no") {
      url.searchParams.set("mayorista", mayoristaUrl);
    }
    if (ordenActual === "ventas_web") {
      url.searchParams.set("orden", "ventas_web");
    }
    const qFetch = debouncedQ.trim();
    if (qFetch) {
      url.searchParams.set("q", qFetch);
    }
    if (alertasQueryParam) {
      url.searchParams.set("alertas", alertasQueryParam);
    }

    void fetch(url.toString(), { signal: controlador.signal, credentials: "same-origin" })
      .then(async (respuesta) => {
        const cuerpo = (await respuesta.json()) as RespuestaApiInventario;
        if (!respuesta.ok || !cuerpo.ok) {
          throw new Error(!cuerpo.ok ? cuerpo.error : "Error al cargar inventario.");
        }
        setProductos(cuerpo.productos);
        setProveedores(cuerpo.proveedores);
        setPageSizeActual(cuerpo.pageSize);
        setTotal(cuerpo.total);
        setTotalPaginas(cuerpo.totalPages);
        setInicioRango(cuerpo.inicioRango);
        if (cuerpo.page > cuerpo.totalPages && cuerpo.totalPages >= 1) {
          router.replace(
            construirQueryInventario({
              page: cuerpo.totalPages,
              categoria: categoriaActual,
              subcategoria: subcategoriaActual || undefined,
              mayorista: mayoristaUrl,
              orden: ordenActual,
              pageSize: pageSizeParam,
              q: qUrl.trim() || undefined,
              alertas: alertasParaUrl,
            }),
          );
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setErrorCarga(error instanceof Error ? error.message : "Error al cargar inventario.");
        setProductos([]);
        setProveedores([]);
        setTotal(0);
      })
      .finally(() => {
        if (!controlador.signal.aborted) {
          setCargando(false);
        }
      });

    return () => controlador.abort();
  }, [
    categoriaActual,
    subcategoriaActual,
    mayoristaUrl,
    ordenActual,
    pageSizeParam,
    paginaInventario,
    debouncedQ,
    qUrl,
    router,
    alertasQueryParam,
    alertasParaUrl,
  ]);

  const sincronizarCatalogoWoo = useCallback(async () => {
    setSincronizando(true);
    setMensajeSync(null);
    try {
      const respuesta = await fetch("/api/sync", { method: "POST" });
      const cuerpo = (await respuesta.json()) as {
        ok?: boolean;
        error?: string;
        synced_categories?: number;
        synced_products?: number;
      };
      if (!respuesta.ok || !cuerpo.ok) {
        throw new Error(cuerpo.error ?? "No se pudo sincronizar.");
      }
      setMensajeSync(
        `Listo: ${cuerpo.synced_categories ?? 0} categorías y ${cuerpo.synced_products ?? 0} productos.`,
      );
      router.refresh();
      setSaludCatalogoTick((t) => t + 1);
    } catch (error) {
      setMensajeSync(
        error instanceof Error ? error.message : "Error al sincronizar.",
      );
    } finally {
      setSincronizando(false);
    }
  }, [router]);

  const alCambiarCategoriaDesdeSelect = useCallback(
    (valor: string) => {
      if (valor === "__todas__") {
        router.push(
          construirQueryInventario({
            page: 1,
            mayorista: mayoristaUrl,
            orden: ordenActual,
            pageSize: pageSizeParam,
            q: qUrl.trim() || undefined,
            alertas: alertasParaUrl,
          }),
        );
        return;
      }
      router.push(
        construirQueryInventario({
          page: 1,
          categoria: valor,
          mayorista: mayoristaUrl,
          orden: ordenActual,
          pageSize: pageSizeParam,
          q: qUrl.trim() || undefined,
          alertas: alertasParaUrl,
        }),
      );
    },
    [router, mayoristaUrl, ordenActual, pageSizeParam, qUrl, alertasParaUrl],
  );

  const alCambiarSubcategoriaDesdeSelect = useCallback(
    (valor: string) => {
      if (valor === "__sin_categoria_padre__") return;
      if (!categoriaActual.trim()) return;
      router.push(
        construirQueryInventario({
          page: 1,
          categoria: categoriaActual,
          subcategoria: valor === "__toda_la_categoria__" ? undefined : valor,
          mayorista: mayoristaUrl,
          orden: ordenActual,
          pageSize: pageSizeParam,
          q: qUrl.trim() || undefined,
          alertas: alertasParaUrl,
        }),
      );
    },
    [router, categoriaActual, mayoristaUrl, ordenActual, pageSizeParam, qUrl, alertasParaUrl],
  );

  const alCambiarMayorista = useCallback(
    (valor: string) => {
      const mayorista =
        valor === "si" || valor === "no" ? (valor as "si" | "no") : ("" as const);
      router.push(
        construirQueryInventario({
          page: 1,
          categoria: categoriaActual || undefined,
          subcategoria: subcategoriaActual || undefined,
          mayorista,
          orden: ordenActual,
          pageSize: pageSizeParam,
          q: qUrl.trim() || undefined,
          alertas: alertasParaUrl,
        }),
      );
    },
    [router, categoriaActual, subcategoriaActual, ordenActual, pageSizeParam, qUrl, alertasParaUrl],
  );

  const alCambiarOrden = useCallback(
    (valor: OrdenInventario) => {
      router.push(
        construirQueryInventario({
          page: 1,
          categoria: categoriaActual || undefined,
          subcategoria: subcategoriaActual || undefined,
          mayorista: mayoristaUrl,
          orden: valor,
          pageSize: pageSizeParam,
          q: qUrl.trim() || undefined,
          alertas: alertasParaUrl,
        }),
      );
    },
    [router, categoriaActual, subcategoriaActual, mayoristaUrl, pageSizeParam, qUrl, alertasParaUrl],
  );

  const alCambiarPageSize = useCallback(
    (valor: string) => {
      const next: PageSizeInventario =
        valor === "50" || valor === "100" || valor === "max" ? valor : PAGE_SIZE_DEFAULT;
      router.push(
        construirQueryInventario({
          page: 1,
          categoria: categoriaActual || undefined,
          subcategoria: subcategoriaActual || undefined,
          mayorista: mayoristaUrl,
          orden: ordenActual,
          pageSize: next,
          q: qUrl.trim() || undefined,
          alertas: alertasParaUrl,
        }),
      );
    },
    [router, categoriaActual, subcategoriaActual, mayoristaUrl, ordenActual, qUrl, alertasParaUrl],
  );

  const alternarHealthFilter = useCallback(
    (id: InventoryHealthAlertKey) => {
      const current = parseAlertasInventarioParam(alertasQueryParam || null);
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      router.push(
        construirQueryInventario({
          page: 1,
          categoria: categoriaActual || undefined,
          subcategoria: subcategoriaActual || undefined,
          mayorista: mayoristaUrl,
          orden: ordenActual,
          pageSize: pageSizeParam,
          q: qUrl.trim() || undefined,
          alertas: next.length > 0 ? next.join(",") : undefined,
        }),
      );
    },
    [
      router,
      alertasQueryParam,
      categoriaActual,
      subcategoriaActual,
      mayoristaUrl,
      ordenActual,
      pageSizeParam,
      qUrl,
    ],
  );

  const alCrearProveedorDesdeInventario = useCallback((proveedor: ProveedorInsertado) => {
    setProveedores((prev) =>
      prev.some((p) => p.id === proveedor.id)
        ? prev
        : [...prev, { id: proveedor.id, nombre_fantasia: proveedor.nombre_fantasia }].sort((a, b) =>
            a.nombre_fantasia.localeCompare(b.nombre_fantasia, "es"),
          ),
    );
  }, []);

  const hrefPaginacion = useCallback(
    (pagina: number) =>
      construirQueryInventario({
        page: pagina,
        categoria: categoriaActual || undefined,
        subcategoria: subcategoriaActual || undefined,
        mayorista: mayoristaUrl,
        orden: ordenActual,
        pageSize: pageSizeParam,
        q: qUrl.trim() || undefined,
        alertas: alertasParaUrl,
      }),
    [categoriaActual, subcategoriaActual, mayoristaUrl, ordenActual, pageSizeParam, qUrl, alertasParaUrl],
  );

  const filtroPorCategorias =
    Boolean(categoriaActual.trim()) || Boolean(subcategoriaActual.trim());

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 shadow-sm dark:border-primary/40 dark:bg-primary/10">
        <div className="mb-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <label
            htmlFor="inventario-busqueda"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Buscar en el catálogo
          </label>
          <span className="text-xs font-medium text-primary">Sin necesidad de elegir categoría</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Nombre, SKU o precio exacto (ej. 450). La búsqueda se guarda en la URL. Los filtros de
          categoría son opcionales y acotan el listado.
        </p>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-primary"
            aria-hidden
          />
          <Input
            id="inventario-busqueda"
            value={inputQ}
            onChange={(evento) => setInputQ(evento.target.value)}
            placeholder="Ej. arroz, SKU-12, 450"
            className="h-11 border-border bg-background pl-11 text-base shadow-inner focus-visible:border-primary focus-visible:ring-primary/20"
            autoComplete="off"
          />
        </div>
      </div>

      {categorias.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <p className="text-foreground">
            Todavía no hay categorías cargadas. Sincronizá el catálogo para traer datos de la tienda.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={sincronizando}
              onClick={() => void sincronizarCatalogoWoo()}
            >
              {sincronizando ? "Sincronizando…" : "Sincronizar catálogo"}
            </Button>
          </div>
          {mensajeSync ? (
            <p className="mt-2 text-xs text-foreground">{mensajeSync}</p>
          ) : null}
        </div>
      ) : null}

      {categorias.length > 0 ? (
        <div className="rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex min-w-[min(100%,220px)] flex-1 flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor="inventario-categoria-raiz" className="text-xs text-muted-foreground">
                Categoría principal <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Select
                value={categoriaActual.trim() ? categoriaActual : "__todas__"}
                onValueChange={alCambiarCategoriaDesdeSelect}
              >
                <SelectTrigger id="inventario-categoria-raiz" className="h-9 w-full bg-background">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-72">
                  <SelectItem value="__todas__">Todas las categorías</SelectItem>
                  {raices.map((categoria) => {
                    const erroresCategoria =
                      saludCatalogo?.byRootCategory[String(categoria.id)] ?? 0;
                    const sufijo = erroresCategoria > 0 ? ` (${erroresCategoria} alertas)` : "";
                    return (
                      <SelectItem key={categoria.id} value={String(categoria.id)}>
                        {categoria.nombre}
                        {sufijo}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-[min(100%,220px)] flex-1 flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor="inventario-subcategoria" className="text-xs text-muted-foreground">
                Subcategoría <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Select
                value={
                  !categoriaActual.trim()
                    ? "__sin_categoria_padre__"
                    : subcategoriaActual.trim()
                      ? subcategoriaActual
                      : "__toda_la_categoria__"
                }
                onValueChange={alCambiarSubcategoriaDesdeSelect}
                disabled={!categoriaActual.trim()}
              >
                <SelectTrigger id="inventario-subcategoria" className="h-9 w-full bg-background">
                  <SelectValue placeholder="Elegí una categoría principal" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-72">
                  {!categoriaActual.trim() ? (
                    <SelectItem value="__sin_categoria_padre__" disabled>
                      Elegí una categoría principal
                    </SelectItem>
                  ) : (
                    <>
                      <SelectItem value="__toda_la_categoria__">Toda la categoría</SelectItem>
                      {subcategorias.map((sub) => (
                        <SelectItem key={sub.id} value={String(sub.id)}>
                          {sub.nombre}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ) : null}

      {categorias.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Alertas de Catálogo</p>
              <p className="mt-0.5 max-w-xl text-[11px] leading-snug text-muted-foreground">
                {filtroPorCategorias
                  ? "Los conteos corresponden a la categoría (y subcategoría, si aplica) elegidas en los desplegables."
                  : "Los conteos son de todo el catálogo. Podés acotar con categoría y subcategoría arriba."}{" "}
                Al activar un chip, el listado se filtra en el servidor (coincide con el conteo).
              </p>
            </div>
            {alertasFiltroLista.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    construirQueryInventario({
                      page: 1,
                      categoria: categoriaActual || undefined,
                      subcategoria: subcategoriaActual || undefined,
                      mayorista: mayoristaUrl,
                      orden: ordenActual,
                      pageSize: pageSizeParam,
                      q: qUrl.trim() || undefined,
                    }),
                  )
                }
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Limpiar alertas
              </button>
            ) : null}
          </div>
          {saludCatalogoError ? (
            <p className="text-xs text-destructive">{saludCatalogoError}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {HEALTH_CHIPS.map((chip) => {
              const count =
                saludCatalogoCargando || !saludCatalogo
                  ? null
                  : (saludCatalogo.totals[chip.id] ?? 0);
              const active = alertasFiltroLista.includes(chip.id);
              const Icono = chip.icon;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => alternarHealthFilter(chip.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active ? chip.activeClassName : chip.className,
                  )}
                  aria-pressed={active}
                >
                  <Icono className="size-3.5" aria-hidden />
                  {chip.label} ({count === null ? "…" : count})
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="border-t border-border pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex min-w-[160px] flex-col gap-1.5">
          <label htmlFor="filtro-mayorista-panel" className="text-xs font-medium text-muted-foreground">
            Mayorista
          </label>
          <select
            id="filtro-mayorista-panel"
            value={mayoristaUrl}
            onChange={(evento) => alCambiarMayorista(evento.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Todos</option>
            <option value="si">Publicado (sí)</option>
            <option value="no">No publicado</option>
          </select>
        </div>
        <div className="flex min-w-[160px] flex-col gap-1.5">
          <label htmlFor="filtro-orden-panel" className="text-xs font-medium text-muted-foreground">
            Orden
          </label>
          <select
            id="filtro-orden-panel"
            value={ordenActual}
            onChange={(evento) =>
              alCambiarOrden(evento.target.value === "ventas_web" ? "ventas_web" : "woo_id")
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="woo_id">ID producto</option>
            <option value="ventas_web">Más vendidos (web)</option>
          </select>
        </div>
        <div className="flex min-w-[170px] flex-col gap-1.5">
          <label
            htmlFor="filtro-page-size-panel"
            className="text-xs font-medium text-muted-foreground"
          >
            Productos por página
          </label>
          <select
            id="filtro-page-size-panel"
            value={pageSizeParam}
            onChange={(evento) => alCambiarPageSize(evento.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="max">Máximo</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-0.5">
          {categorias.length > 0 ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={construirQueryInventario({ page: 1 })}>Reiniciar vista</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={sincronizando}
            onClick={() => void sincronizarCatalogoWoo()}
          >
            {sincronizando ? "Sincronizando…" : "Sincronizar catálogo"}
          </Button>
        </div>
        </div>
      </div>
      {mensajeSync && categorias.length > 0 ? (
        <p className="text-xs text-foreground">{mensajeSync}</p>
      ) : null}

      {errorCarga ? (
        <p className="text-sm text-destructive" role="alert">
          {errorCarga}
        </p>
      ) : null}

      {cargando ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Cargando productos…
        </div>
      ) : null}

      {!cargando ? (
        <InventarioTablaProductos
          productos={productos}
          proveedores={proveedores}
          resetKey={[
            paginaInventario,
            pageSizeParam,
            categoriaActual,
            subcategoriaActual,
            mayoristaUrl,
            ordenActual,
            debouncedQ,
            alertasQueryParam,
            productos.map((producto) => producto.woo_product_id).join("-"),
          ].join("|")}
          onProveedorCreado={alCrearProveedorDesdeInventario}
        />
      ) : null}

      {!cargando ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {total === 0
              ? "No hay productos para estos filtros."
              : `Mostrando ${inicioRango + 1}-${inicioRango + productos.length} de ${total} · ${pageSizeActual === "max" ? "máximo" : pageSizeActual} por página`}
            {alertasFiltroLista.length > 0 ? " · filtro de alertas activo" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={hrefPaginacion(Math.max(1, paginaInventario - 1))}
              className={cn(
                "inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium",
                paginaInventario <= 1
                  ? "pointer-events-none opacity-40"
                  : "hover:bg-muted",
              )}
              aria-disabled={paginaInventario <= 1}
            >
              Anterior
            </Link>
            <span className="text-xs text-muted-foreground">
              Página {paginaInventario} de {totalPaginas}
            </span>
            <Link
              href={hrefPaginacion(Math.min(totalPaginas, paginaInventario + 1))}
              className={cn(
                "inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium",
                paginaInventario >= totalPaginas
                  ? "pointer-events-none opacity-40"
                  : "hover:bg-muted",
              )}
              aria-disabled={paginaInventario >= totalPaginas}
            >
              Siguiente
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
