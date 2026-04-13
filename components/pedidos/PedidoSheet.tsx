"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import { Loader2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EtiquetaEnvioDocument, etiquetaPedidoFileName } from "@/components/pedidos/EtiquetaEnvio";
import type { WooPedidoAdmin } from "@/lib/woo-pedido-admin-types";
import { cn } from "@/lib/utils";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
  { ssr: false },
);

type PedidoSheetImprimirEtiquetaProps = {
  pedido: WooPedidoAdmin;
  /** En tablas: texto más corto y ancho automático. */
  compacto?: boolean;
  /** Solo icono de impresora (p. ej. fila de tabla). */
  soloIcono?: boolean;
  className?: string;
  size?: ComponentProps<typeof Button>["size"];
};

/**
 * Descarga de etiqueta A6 (react-pdf). Cargado solo en cliente para evitar problemas de hidratación.
 */
export function PedidoSheetImprimirEtiqueta({
  pedido,
  compacto = false,
  soloIcono = false,
  className,
  size = "default",
}: PedidoSheetImprimirEtiquetaProps) {
  const etiqueta = compacto ? "Imprimir etiqueta" : "Imprimir Etiqueta de Envío";
  const tam = soloIcono ? "icon" : size;

  return (
    <Button
      variant="outline"
      size={tam}
      className={cn(
        soloIcono && "size-8 shrink-0 p-0",
        !soloIcono && compacto && "w-auto shrink-0",
        !soloIcono && !compacto && "w-full",
        className,
      )}
      asChild
    >
      <PDFDownloadLink
        document={<EtiquetaEnvioDocument pedido={pedido} />}
        fileName={etiquetaPedidoFileName(pedido)}
        title={soloIcono ? "Descargar etiqueta de envío (PDF)" : undefined}
      >
        {({ loading }) =>
          soloIcono ? (
            <>
              {loading ? (
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <Printer className="size-4 shrink-0" aria-hidden />
              )}
              <span className="sr-only">
                {loading ? "Generando PDF de etiqueta" : "Descargar etiqueta de envío"}
              </span>
            </>
          ) : (
            <>
              <Printer className="size-4 shrink-0" aria-hidden />
              {loading ? "Generando..." : etiqueta}
            </>
          )
        }
      </PDFDownloadLink>
    </Button>
  );
}
