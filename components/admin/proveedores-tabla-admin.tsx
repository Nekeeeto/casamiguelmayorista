"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { CrearProveedorModal } from "@/components/admin/crear-proveedor-modal";
import { Button } from "@/components/ui/button";

type ProveedorFila = {
  id: string;
  nombre_fantasia: string;
  logo_url: string | null;
  rut: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  productos_totales: number;
};

type Props = {
  proveedoresIniciales: ProveedorFila[];
};

export function ProveedoresTablaAdmin({ proveedoresIniciales }: Props) {
  const [proveedores, setProveedores] = useState(proveedoresIniciales);
  const [mostrarModal, setMostrarModal] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setMostrarModal(true)}>
          Nuevo Proveedor
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Logo</th>
              <th className="px-4 py-3 text-left font-medium">Nombre</th>
              <th className="px-4 py-3 text-left font-medium">RUT</th>
              <th className="px-4 py-3 text-left font-medium">Contacto Principal</th>
              <th className="px-4 py-3 text-left font-medium">Teléfono</th>
              <th className="px-4 py-3 text-right font-medium">Productos totales</th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((proveedor) => (
              <tr key={proveedor.id} className="border-t border-border/80 align-middle">
                <td className="px-4 py-3">
                  <div className="flex h-10 w-14 items-center justify-start overflow-hidden">
                    {proveedor.logo_url ? (
                      <Image
                        src={proveedor.logo_url}
                        alt={proveedor.nombre_fantasia}
                        width={56}
                        height={40}
                        className="h-8 w-auto max-w-14 object-contain"
                        unoptimized
                      />
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium">
                  <Link href={`/proveedores/${proveedor.id}`} className="text-foreground hover:underline">
                    {proveedor.nombre_fantasia}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{proveedor.rut ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{proveedor.contacto ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{proveedor.telefono ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {proveedor.productos_totales}
                </td>
              </tr>
            ))}
            {proveedores.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No hay proveedores creados todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <CrearProveedorModal
        open={mostrarModal}
        onOpenChange={setMostrarModal}
        onCreado={(proveedor) => {
          setProveedores((prev) =>
            [...prev, proveedor].sort((a, b) =>
              a.nombre_fantasia.localeCompare(b.nombre_fantasia, "es"),
            ),
          );
        }}
      />
    </div>
  );
}
