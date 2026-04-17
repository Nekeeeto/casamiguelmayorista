import type { WhatsappPricingMap } from "@/lib/whatsapp-config";
import type { WhatsappTemplate } from "@/lib/whatsapp-cloud-api";

export type CostoCategoria = keyof WhatsappPricingMap;

export function categoriaTemplate(template: Pick<WhatsappTemplate, "category">): CostoCategoria {
  switch (template.category) {
    case "MARKETING":
      return "marketing";
    case "UTILITY":
      return "utility";
    case "AUTHENTICATION":
      return "authentication";
    default:
      return "marketing";
  }
}

export type CostoEstimado = {
  categoria: CostoCategoria;
  unitarioUsd: number;
  totalUsd: number;
  totalValidos: number;
};

export function estimarCosteBroadcast(
  pricing: WhatsappPricingMap,
  template: Pick<WhatsappTemplate, "category">,
  totalValidos: number,
): CostoEstimado {
  const categoria = categoriaTemplate(template);
  const unitarioUsd = pricing[categoria] ?? 0;
  const totalUsd = Number((unitarioUsd * Math.max(0, totalValidos)).toFixed(4));
  return { categoria, unitarioUsd, totalUsd, totalValidos };
}
