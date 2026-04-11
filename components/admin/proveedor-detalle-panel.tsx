"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";

import { actualizarCampoProveedorAction } from "@/app/(admin)/proveedores/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Proveedor = {
  id: string;
  nombre_fantasia: string;
  logo_url: string | null;
  rut: string | null;
  email: string | null;
  telefono: string | null;
  contacto: string | null;
  notas: string | null;
};

type Props = {
  proveedor: Proveedor;
  metricas: {
    productosVinculados: number;
    costoTotalStock: number;
  };
  productosVinculados: Array<{
    woo_product_id: number;
    nombre: string;
    image_url: string | null;
  }>;
};

type CamposEditables = "nombre_fantasia" | "rut" | "email" | "telefono" | "contacto" | "notas";

function monedaUy(valor: number) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 2,
  }).format(valor);
}

export function ProveedorDetallePanel({ proveedor, metricas, productosVinculados }: Props) {
  const [form, setForm] = useState({
    nombre_fantasia: proveedor.nombre_fantasia,
    rut: proveedor.rut ?? "",
    email: proveedor.email ?? "",
    telefono: proveedor.telefono ?? "",
    contacto: proveedor.contacto ?? "",
    notas: proveedor.notas ?? "",
    logo_url: proveedor.logo_url ?? "",
  });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  function guardarCampo(campo: CamposEditables) {
    setMensaje(null);
    setError(null);
    startTransition(async () => {
      const res = await actualizarCampoProveedorAction(proveedor.id, campo, form[campo]);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMensaje("Cambios guardados.");
    });
  }

  async function subirLogo(archivo: File | null) {
    if (!archivo) return;
    setMensaje(null);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();
      const extension = archivo.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${proveedor.id}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("proveedores-logos")
        .upload(path, archivo, { upsert: true });
      if (uploadError) {
        setError(uploadError.message);
        return;
      }
      const { data } = supabase.storage.from("proveedores-logos").getPublicUrl(path);
      const logoUrl = data.publicUrl;
      const res = await actualizarCampoProveedorAction(proveedor.id, "logo_url", logoUrl);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setForm((prev) => ({ ...prev, logo_url: logoUrl }));
      setMensaje("Logo actualizado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el logo.");
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      <Card className="bg-card">
        <CardHeader className="flex-row items-center gap-2">
          <Link
            href="/proveedores"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Volver a proveedores"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <CardTitle>Edición</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Logo</Label>
            <div className="flex flex-wrap items-start gap-3">
              <div className="size-24 overflow-hidden rounded-lg border border-border bg-muted/30">
                {form.logo_url ? (
                  <Image
                    src={form.logo_url}
                    alt={form.nombre_fantasia}
                    width={96}
                    height={96}
                    className="h-full w-full object-contain p-1"
                    unoptimized
                  />
                ) : null}
              </div>
              <div className="flex-1 space-y-2">
                <div
                  className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void subirLogo(event.dataTransfer.files?.[0] ?? null);
                  }}
                >
                  Arrastrá un archivo o usá el botón para subir logo.
                </div>
                <input
                  ref={inputArchivoRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    void subirLogo(event.target.files?.[0] ?? null);
                    if (inputArchivoRef.current) {
                      inputArchivoRef.current.value = "";
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={() => inputArchivoRef.current?.click()}>
                  Subir logo
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="prov-nombre">Nombre fantasía</Label>
              <Input
                id="prov-nombre"
                value={form.nombre_fantasia}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, nombre_fantasia: event.target.value }))
                }
                onBlur={() => guardarCampo("nombre_fantasia")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-rut">RUT</Label>
              <Input
                id="prov-rut"
                value={form.rut}
                onChange={(event) => setForm((prev) => ({ ...prev, rut: event.target.value }))}
                onBlur={() => guardarCampo("rut")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-contacto">Contacto principal</Label>
              <Input
                id="prov-contacto"
                value={form.contacto}
                onChange={(event) => setForm((prev) => ({ ...prev, contacto: event.target.value }))}
                onBlur={() => guardarCampo("contacto")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-telefono">Teléfono</Label>
              <Input
                id="prov-telefono"
                value={form.telefono}
                onChange={(event) => setForm((prev) => ({ ...prev, telefono: event.target.value }))}
                onBlur={() => guardarCampo("telefono")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-email">Email</Label>
              <Input
                id="prov-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                onBlur={() => guardarCampo("email")}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="prov-notas">Notas</Label>
              <Textarea
                id="prov-notas"
                value={form.notas}
                onChange={(event) => setForm((prev) => ({ ...prev, notas: event.target.value }))}
                onBlur={() => guardarCampo("notas")}
                className="min-h-[140px]"
              />
            </div>
          </div>

          {pendiente ? <p className="text-xs text-muted-foreground">Guardando...</p> : null}
          {mensaje ? <p className="text-sm text-muted-foreground">{mensaje}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base">
              Productos vinculados ({metricas.productosVinculados})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {productosVinculados.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {productosVinculados.map((producto) => (
                  <Link
                    key={producto.woo_product_id}
                    href={`/admin/inventario/${producto.woo_product_id}`}
                    className="space-y-1 rounded-md border border-border bg-muted/20 p-2 hover:bg-muted/40"
                    title={producto.nombre}
                  >
                    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-background">
                      {producto.image_url ? (
                        <Image
                          src={producto.image_url}
                          alt={producto.nombre}
                          width={80}
                          height={80}
                          className="h-full w-full object-contain"
                          unoptimized
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Sin imagen</span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-[11px] leading-tight text-foreground">{producto.nombre}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hay productos vinculados.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base">Costo Total en Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-foreground">{monedaUy(metricas.costoTotalStock)}</p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base">Rentabilidad (próximamente)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-44 rounded-lg border border-dashed border-border bg-muted/30" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
