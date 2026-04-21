"use client";

import { ExternalLink } from "lucide-react";

import type { WhatsappTemplateComponent } from "@/lib/whatsapp-cloud-api";
import {
  aplicarSlotsATexto,
  extraerPlaceholders,
  extraerSlotsDeTexto,
  baseUrlBotonDinamico,
} from "@/lib/whatsapp-templates";
import { cn } from "@/lib/utils";

function normalizarTipoBoton(t: unknown): string {
  return String(t ?? "").toUpperCase();
}

function botonesDesdeComponente(components: WhatsappTemplateComponent[]): unknown[] {
  const c = components.find((x) => x.type === "BUTTONS");
  const b = c?.buttons;
  return Array.isArray(b) ? b : [];
}

type Props = {
  components: WhatsappTemplateComponent[];
  /** Orden: mismos `orderedSlots` del template + sufijos URL en orden `urlButtonsDinamicos`. */
  valoresEjemplo: string[];
  headerMediaUrl?: string | null;
  className?: string;
};

export function WhatsappTemplateLivePreview({ components, valoresEjemplo, headerMediaUrl, className }: Props) {
  const ph = extraerPlaceholders(components);
  const slotN = ph.orderedSlots.length;
  const slotVals = valoresEjemplo.slice(0, slotN);
  const urlSufijos = valoresEjemplo.slice(slotN, slotN + ph.urlButtonsDinamicos.length);

  const headerComp = components.find((c) => c.type === "HEADER");
  const bodyComp = components.find((c) => c.type === "BODY");
  const footerComp = components.find((c) => c.type === "FOOTER");

  const hSlots = headerComp?.format === "TEXT" && headerComp.text ? extraerSlotsDeTexto(headerComp.text) : [];
  const bSlots = bodyComp?.text ? extraerSlotsDeTexto(bodyComp.text) : [];
  const hVals = slotVals.slice(0, ph.headerSlotCount);
  const bVals = slotVals.slice(ph.headerSlotCount);

  const headerTexto =
    headerComp?.format === "TEXT" && headerComp.text ? aplicarSlotsATexto(headerComp.text, hSlots, hVals) : null;
  const bodyTexto = bodyComp?.text ? aplicarSlotsATexto(bodyComp.text, bSlots, bVals) : "";
  const footerTexto = footerComp?.text?.trim() ?? "";

  const fmt = headerComp?.format;
  const media = headerMediaUrl?.trim();

  const rawBotones = botonesDesdeComponente(components);
  let dinIdx = 0;

  return (
    <div
      className={cn(
        "mx-auto max-w-sm rounded-2xl border border-border bg-[#0a0a0a] p-3 shadow-lg",
        "ring-1 ring-white/10",
        className,
      )}
    >
      <p className="mb-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Vista previa (valores de ejemplo)
      </p>
      <div className="rounded-xl bg-[#111b21] px-2.5 py-2">
        {fmt && ["IMAGE", "VIDEO", "DOCUMENT"].includes(fmt) && media && /^https:\/\//i.test(media) ? (
          <div className="mb-2 overflow-hidden rounded-lg">
            {fmt === "IMAGE" ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview admin; URL externa HTTPS
              <img src={media} alt="" className="max-h-40 w-full object-cover" />
            ) : (
              <div className="rounded-md bg-muted/30 px-2 py-3 text-center text-xs text-muted-foreground">
                {fmt === "VIDEO" ? "Video" : "Documento"} ·{" "}
                <a className="text-primary underline" href={media} rel="noreferrer" target="_blank">
                  abrir
                </a>
              </div>
            )}
          </div>
        ) : null}
        {headerTexto ? (
          <p className="mb-1.5 whitespace-pre-wrap text-[13px] font-medium leading-snug text-[#e9edef]">{headerTexto}</p>
        ) : null}
        {bodyTexto ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#e9edef]">{bodyTexto}</p>
        ) : null}
        {footerTexto ? (
          <p className="mt-2 whitespace-pre-wrap text-[11px] leading-snug text-[#8696a0]">{footerTexto}</p>
        ) : null}
        {rawBotones.length > 0 ? (
          <div className="mt-3 space-y-2">
            {rawBotones.map((raw, i) => {
              if (!raw || typeof raw !== "object") return null;
              const o = raw as Record<string, unknown>;
              const tipo = normalizarTipoBoton(o.type);
              const titulo = typeof o.text === "string" ? o.text : "Botón";
              if (tipo === "QUICK_REPLY") {
                return (
                  <div
                    key={`qr-${i}`}
                    className="rounded-md border border-[#2a3942] bg-transparent py-2 text-center text-[13px] text-[#00a884]"
                  >
                    {titulo}
                  </div>
                );
              }
              if (tipo === "URL") {
                const url = typeof o.url === "string" ? o.url : "";
                const esDin = url.includes("{{");
                const suf = esDin ? (urlSufijos[dinIdx++] ?? "").trim() : "";
                const href = esDin ? `${baseUrlBotonDinamico(url)}${suf}` : url;
                return (
                  <a
                    key={`url-${i}`}
                    href={href || "#"}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="flex items-center justify-center gap-2 rounded-md border border-[#00a884] py-2 text-[13px] font-medium text-[#00a884] no-underline"
                    onClick={(e) => {
                      if (!href) e.preventDefault();
                    }}
                  >
                    {titulo}
                    <ExternalLink className="size-3.5 shrink-0 opacity-80" aria-hidden />
                  </a>
                );
              }
              return null;
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
