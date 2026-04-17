import Link from "next/link";
import { ArrowLeft, ImageIcon, MessageCircle, MonitorUp, RefreshCw } from "lucide-react";

import { AdminDashboardHeader } from "@/components/admin/admin-dashboard-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TARJETAS = [
  {
    href: "/herramientas/carga-productos",
    titulo: "Carga con IA (productos)",
    descripcion: "Extrae ficha desde captura o archivo y crea borradores en WooCommerce.",
    Icon: MonitorUp,
  },
  {
    href: "/herramientas/imagenes-gemini",
    titulo: "Imágenes Gemini",
    descripcion: "Genera packshots o variantes de galería a partir de una referencia.",
    Icon: ImageIcon,
  },
  {
    href: "/herramientas/ofertas-semanales",
    titulo: "Ofertas semanales",
    descripcion: "Rotador semanal, listado manual y envío a la tienda.",
    Icon: RefreshCw,
  },
  {
    href: "/herramientas/whatsapp-marketing",
    titulo: "WhatsApp Marketing",
    descripcion: "Broadcasts, bandeja de mensajes y notificaciones Woo sobre WhatsApp Cloud API.",
    Icon: MessageCircle,
  },
] as const;

export default function HerramientasIndexPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Volver al panel de administración"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <AdminDashboardHeader pestanaActiva="herramientas" />
      </div>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Herramientas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Elegí una herramienta; cada una abre en su propia pantalla.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {TARJETAS.map(({ href, titulo, descripcion, Icon }) => (
          <Link key={href} href={href} className="block transition-opacity hover:opacity-90">
            <Card className="h-full bg-card hover:border-primary/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  {titulo}
                </CardTitle>
                <CardDescription>{descripcion}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
