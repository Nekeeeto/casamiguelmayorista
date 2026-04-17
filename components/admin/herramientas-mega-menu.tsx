"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ChevronDown,
  ImageIcon,
  LineChart,
  Mail,
  MessageCircle,
  MonitorUp,
  RefreshCw,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ENLACES = [
  {
    href: "/herramientas/carga-productos",
    titulo: "Carga con IA (productos)",
    descripcion: "Screenshot o ficha → borrador WooCommerce.",
    Icon: MonitorUp,
  },
  {
    href: "/herramientas/imagenes-gemini",
    titulo: "Imágenes Gemini",
    descripcion: "Packshot y galería con referencia.",
    Icon: ImageIcon,
  },
  {
    href: "/herramientas/ofertas-semanales",
    titulo: "Ofertas semanales",
    descripcion: "Rotación y listado manual hacia la tienda.",
    Icon: RefreshCw,
  },
  {
    href: "/herramientas/whatsapp-marketing",
    titulo: "WhatsApp Marketing",
    descripcion: "Broadcasts, bandeja y notificaciones Woo.",
    Icon: MessageCircle,
  },
] as const;

const PROXIMAMENTE = [
  {
    id: "seo",
    titulo: "Agente SEO",
    descripcion: "Auditorías, metadatos y contenido orientado a búsqueda.",
    Icon: Search,
  },
  {
    id: "media-buyer",
    titulo: "Media Buyer",
    descripcion: "Campañas paid, presupuestos y métricas en un solo lugar.",
    Icon: LineChart,
  },
  {
    id: "email",
    titulo: "Email Marketer",
    descripcion: "Flujos, segmentos y envíos transaccionales.",
    Icon: Mail,
  },
] as const;

export function HerramientasMegaMenu() {
  const pathname = usePathname();
  const activa = pathname.startsWith("/herramientas");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            activa
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-haspopup="dialog"
        >
          <Bot className="size-4 shrink-0" aria-hidden />
          Herramientas
          <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(100vw-2rem,40rem)] p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Herramientas admin
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {ENLACES.map(({ href, titulo, descripcion, Icon }) => {
            const itemActivo = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent",
                  itemActivo && "border-primary/50 bg-accent/50",
                )}
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {titulo}
                </span>
                <span className="text-xs text-muted-foreground">{descripcion}</span>
              </Link>
            );
          })}
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Próximamente
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PROXIMAMENTE.map(({ id, titulo, descripcion, Icon }) => (
              <div
                key={id}
                className="flex flex-col gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/25 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {titulo}
                  </span>
                  <Badge variante="warning" className="shrink-0">
                    Próximamente
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{descripcion}</p>
              </div>
            ))}
          </div>
        </div>
        <Link
          href="/herramientas"
          className="mt-3 block text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Ver resumen
        </Link>
      </PopoverContent>
    </Popover>
  );
}
