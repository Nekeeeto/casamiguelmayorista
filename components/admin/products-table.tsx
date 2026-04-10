"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { AdminProduct } from "@/lib/types";

export function ProductsTable() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProductId, setSavingProductId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadProducts() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const result = (await response.json()) as {
        products?: AdminProduct[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo cargar el catálogo.");
      }

      setProducts(result.products ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo cargar el catálogo.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  const activeCount = useMemo(
    () => products.filter((product) => product.is_active).length,
    [products],
  );

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
        <div>
          <CardTitle>Catálogo mayorista</CardTitle>
          <CardDescription>
            {activeCount} activos de {products.length} productos WooCommerce
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
            {errorMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="py-8 text-sm text-muted-foreground">Cargando catálogo...</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Producto</th>
                  <th className="px-4 py-3 text-left font-medium">SKU</th>
                  <th className="px-4 py-3 text-left font-medium">Precio base</th>
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
      </CardContent>
    </Card>
  );
}
