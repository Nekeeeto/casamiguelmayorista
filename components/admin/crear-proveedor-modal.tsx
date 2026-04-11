"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";

import {
  crearProveedorAction,
  type ResultadoCrearProveedor,
} from "@/app/(admin)/proveedores/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

const formVacio = {
  nombre_fantasia: "",
  logo_url: "",
  rut: "",
  email: "",
  telefono: "",
  contacto: "",
  notas: "",
};

export type ProveedorInsertado = Extract<ResultadoCrearProveedor, { ok: true }>["proveedor"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se invoca al crear con éxito, antes de cerrar el modal. */
  onCreado?: (proveedor: ProveedorInsertado) => void;
  descripcion?: string;
};

export function CrearProveedorModal({ open, onOpenChange, onCreado, descripcion }: Props) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(formVacio);

  useEffect(() => {
    if (!open) {
      setForm(formVacio);
      setError(null);
    }
  }, [open]);

  function crearProveedor() {
    setError(null);
    startTransition(async () => {
      const res = await crearProveedorAction(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCreado?.(res.proveedor);
      onOpenChange(false);
    });
  }

  async function subirLogoTemporal(archivo: File | null) {
    if (!archivo) return;
    setError(null);
    try {
      const supabase = getSupabaseBrowser();
      const extension = archivo.name.split(".").pop()?.toLowerCase() || "png";
      const path = `tmp/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("proveedores-logos")
        .upload(path, archivo, { upsert: true });
      if (uploadError) {
        setError(uploadError.message);
        return;
      }
      const { data } = supabase.storage.from("proveedores-logos").getPublicUrl(path);
      setForm((prev) => ({ ...prev, logo_url: data.publicUrl }));
    } catch (errorCarga) {
      setError(errorCarga instanceof Error ? errorCarga.message : "No se pudo subir el logo.");
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crear-proveedor-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 id="crear-proveedor-titulo" className="text-lg font-semibold text-foreground">
            Nuevo proveedor
          </h2>
          <p className="text-sm text-muted-foreground">
            {descripcion ?? "Completá los datos básicos para crear el proveedor."}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="modal-proveedor-logo">Logo</Label>
            <div className="flex items-start gap-3">
              <div className="size-14 overflow-hidden rounded-lg border border-border bg-muted/30">
                {form.logo_url ? (
                  <Image
                    src={form.logo_url}
                    alt={form.nombre_fantasia || "Logo proveedor"}
                    width={56}
                    height={56}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                ) : null}
              </div>
              <div className="flex flex-1 flex-wrap gap-2">
                <Input
                  id="modal-proveedor-logo"
                  value={form.logo_url}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, logo_url: event.target.value }))
                  }
                  placeholder="URL pública del logo"
                />
                <Input
                  type="file"
                  accept="image/*"
                  className="max-w-[260px]"
                  onChange={(event) => {
                    void subirLogoTemporal(event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="modal-proveedor-nombre">Nombre fantasía</Label>
            <Input
              id="modal-proveedor-nombre"
              value={form.nombre_fantasia}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, nombre_fantasia: event.target.value }))
              }
              placeholder="Ej. Distribuidora Central"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modal-proveedor-rut">RUT</Label>
            <Input
              id="modal-proveedor-rut"
              value={form.rut}
              onChange={(event) => setForm((prev) => ({ ...prev, rut: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modal-proveedor-contacto">Contacto principal</Label>
            <Input
              id="modal-proveedor-contacto"
              value={form.contacto}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, contacto: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modal-proveedor-telefono">Teléfono</Label>
            <Input
              id="modal-proveedor-telefono"
              value={form.telefono}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, telefono: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modal-proveedor-email">Email</Label>
            <Input
              id="modal-proveedor-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="modal-proveedor-notas">Notas</Label>
            <Textarea
              id="modal-proveedor-notas"
              value={form.notas}
              onChange={(event) => setForm((prev) => ({ ...prev, notas: event.target.value }))}
              className="min-h-[120px]"
            />
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={crearProveedor} disabled={pendiente}>
            {pendiente ? "Guardando…" : "Crear proveedor"}
          </Button>
        </div>
      </div>
    </div>
  );
}
