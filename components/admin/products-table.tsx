"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { AdminProduct } from "@/lib/types";

type ProductsApiResponse = {
  products?: AdminProduct[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  error?: string;
};

export function ProductsTable() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProductId, setSavingProductId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadProducts(targetPage = page) {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/products?page=${targetPage}&pageSize=${pageSize}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as ProductsApiResponse;

      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo cargar el catálogo.");
      }

      setProducts(result.products ?? []);
      setPage(result.pagination?.page ?? targetPage);
      setTotal(result.pagination?.total ?? 0);
      setTotalPages(result.pagination?.totalPages ?? 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo cargar el catálogo.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const activeCount = useMemo(
    () => products.filter((product) => product.is_active).length,
    [products],
  );

  function formatDateTime(value: string | null | undefined) {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return new Intl.DateTimeFormat("es-UY", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  }

  async function handleInitialSync() {
    setSyncing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        synced_products?: number;
        synced_categories?: number;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "No se pudo sincronizar el catálogo.");
      }

      const lineaCategorias =
        typeof result.synced_categories === "number"
          ? ` · ${result.synced_categories} categorias Woo`
          : "";

      setSuccessMessage(
        `Sincronización completa: ${result.synced_products ?? 0} productos${lineaCategorias}.`,
      );
      setPage(1);
      await loadProducts(1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo sincronizar el catálogo.",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggle(product: AdminProduct, checked: boolean) {
    setSavingProductId(product.id);
    setErrorMessage(null);

    setProducts((prev) =>
      prev.map((item) =>
        item.id === product.id ? { ...item, is_active: checked } : item,
      ),
    );

    try {
      const response = await fetch("/api/products/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          woo_product_id: product.id,
          sku: product.sku,
          name: product.name,
          is_active: checked,
        }),
      });

      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? "No se pudo actualizar el estado.");
      }
    } catch (error) {
      setProducts((prev) =>
        prev.map((item) =>
          item.id === product.id ? { ...item, is_active: !checked } : item,
        ),
      );
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo actualizar el estado.",
      );
    } finally {
      setSavingProductId(null);
    }
  }

  return (
    <Card className="bg-surface-elevated">
      <CardHeader>
        <div className="w-full flex items-start justify-between gap-4">
          <div>
          <CardTitle>Catálogo mayorista</CardTitle>
          <CardDescription>
            {activeCount} activos de {products.length} en esta página ({total} total)
          </CardDescription>
          </div>
          <button
            type="button"
            onClick={() => void handleInitialSync()}
            disabled={syncing}
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {syncing ? "Sincronizando..." : "Sincronización inicial"}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="mb-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">
            {successMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="py-8 text-sm text-muted-foreground">Cargando catálogo...</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-surface-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Producto</th>
                  <th className="px-4 py-3 text-left font-medium">SKU</th>
                  <th className="px-4 py-3 text-left font-medium">Precio base</th>
                  <th className="px-4 py-3 text-left font-medium">Actualizado</th>
                  <th className="px-4 py-3 text-right font-medium">Habilitado</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-t border-border/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-12 shrink-0 overflow-hidden rounded-md bg-surface-muted">
                          {product.image ? (
                            <Image
                              src={product.image}
                              alt={product.name}
                              width={48}
                              height={48}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <span className="font-medium">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {product.sku || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {new Intl.NumberFormat("es-UY", {
                        style: "currency",
                        currency: "UYU",
                        maximumFractionDigits: 2,
                      }).format(product.base_price || 0)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDateTime(product.woo_updated_at ?? product.synced_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {product.is_active ? "Activo" : "Inactivo"}
                        </span>
                        <Switch
                          checked={product.is_active}
                          disabled={savingProductId === product.id}
                          onCheckedChange={(checked) =>
                            void handleToggle(product, checked)
                          }
                          aria-label={`Toggle ${product.name}`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={loading || page <= 1}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={loading || page >= totalPages}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
