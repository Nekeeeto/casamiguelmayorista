"use client";

import { CargaMagicaScreenshotPanel } from "@/components/admin/carga-magica-screenshot-panel";
import { GeminiImagenesModals } from "@/components/admin/gemini-imagenes-modals";
import { OfertasSemanalesIaSubmenu } from "@/components/admin/ofertas-semanales-ia-panel";

/** Contenido solo en el cliente (evita errores de SSR / RSC en algunos entornos). */
export default function HerramientasIaInner() {
  return (
    <section className="space-y-6">
      <OfertasSemanalesIaSubmenu />
      <GeminiImagenesModals />
      <CargaMagicaScreenshotPanel />
    </section>
  );
}
