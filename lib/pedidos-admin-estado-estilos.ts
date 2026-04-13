/** Slugs personalizados de Woo → mismo color que el estado “base” si coincide el prefijo. */
export function slugEstadoNormalizado(slug: string): string {
  if (slug === "processing" || slug.startsWith("processing-") || slug.startsWith("proceso")) {
    return "processing";
  }
  if (slug.startsWith("pending") || slug === "awaiting-payment") return "pending";
  if (slug.startsWith("espera-") || slug === "on-hold") return "on-hold";
  if (slug.startsWith("completed") || slug === "wc-completed") return "completed";
  if (slug.startsWith("cancelled") || slug === "canceled") return "cancelled";
  return slug;
}

const CLASE_BADGE_POR_ESTADO: Record<string, string> = {
  pending: "border-yellow-500/55 bg-yellow-500/18 text-yellow-100",
  "on-hold": "border-amber-500/50 bg-amber-500/15 text-amber-100",
  processing: "border-sky-500/50 bg-sky-500/15 text-sky-100",
  completed: "border-emerald-500/50 bg-emerald-500/15 text-emerald-100",
  cancelled: "border-zinc-500/50 bg-zinc-600/20 text-zinc-300",
  refunded: "border-violet-500/50 bg-violet-500/15 text-violet-100",
  failed: "border-red-600/60 bg-red-600/20 text-red-100",
};

const PALETA_ESTADO_DESCONOCIDO = [
  "border-cyan-500/50 bg-cyan-500/15 text-cyan-100",
  "border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-100",
  "border-teal-500/50 bg-teal-500/15 text-teal-100",
  "border-indigo-500/50 bg-indigo-500/15 text-indigo-100",
  "border-orange-500/50 bg-orange-500/15 text-orange-100",
  "border-rose-500/50 bg-rose-500/15 text-rose-100",
] as const;

function hashEstadoSlug(slug: string) {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) {
    h = (Math.imul(31, h) + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Mismas clases que el badge de la tabla de pedidos (fila y chips de filtro). */
export function clasesEstadoPedidoAdmin(estado: string): string {
  const directo = CLASE_BADGE_POR_ESTADO[estado];
  if (directo) return directo;
  const norm = slugEstadoNormalizado(estado);
  if (norm !== estado) {
    const porNorm = CLASE_BADGE_POR_ESTADO[norm];
    if (porNorm) return porNorm;
  }
  return PALETA_ESTADO_DESCONOCIDO[hashEstadoSlug(estado) % PALETA_ESTADO_DESCONOCIDO.length];
}
