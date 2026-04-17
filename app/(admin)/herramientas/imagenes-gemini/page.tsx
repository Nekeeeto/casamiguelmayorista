import { GeminiImagenesModals } from "@/components/admin/gemini-imagenes-modals";
import { HerramientasSubpageShell } from "@/components/admin/herramientas-subpage-shell";

export default function HerramientasImagenesGeminiPage() {
  return (
    <HerramientasSubpageShell>
      <GeminiImagenesModals />
    </HerramientasSubpageShell>
  );
}
