import type {
  WhatsappTemplate,
  WhatsappTemplateComponent,
  WhatsappSendComponent,
  WhatsappSendParameter,
} from "@/lib/whatsapp-cloud-api";

export type ParamSlot =
  | { kind: "positional"; index: number }
  | { kind: "named"; name: string };

export type ComponentePlaceholder = {
  tipo: "header" | "body" | "footer";
  texto: string;
  variables: number[];
};

export type TemplatePlaceholders = {
  header: ComponentePlaceholder | null;
  body: ComponentePlaceholder | null;
  footer: ComponentePlaceholder | null;
  headerFormat: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION" | null;
  /** Cantidad de valores a enviar, en orden: header texto → body → footer. */
  totalVariables: number;
  /** Mismo orden que los inputs del broadcast; Meta exige `parameter_name` si `kind === "named"`. */
  orderedSlots: ParamSlot[];
};

function variablesDeTextoSoloDigitos(texto: string): number[] {
  const matches = texto.match(/\{\{\s*(\d+)\s*\}\}/g) ?? [];
  const nums = matches.map((m) => Number(m.replace(/[^\d]/g, ""))).filter((n) => Number.isFinite(n));
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function componenteDesdeTexto(
  tipo: ComponentePlaceholder["tipo"],
  texto: string | undefined,
): ComponentePlaceholder | null {
  if (!texto) return null;
  return { tipo, texto, variables: variablesDeTextoSoloDigitos(texto) };
}

/**
 * Extrae slots en orden de aparición. `{{1}}` posicional; `{{nombre}}` nombrado (Cloud API 132012 si no mandás `parameter_name`).
 */
export function extraerSlotsDeTexto(texto: string): ParamSlot[] {
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  const slots: ParamSlot[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const inner = m[1].trim();
    if (/^\d+$/.test(inner)) {
      slots.push({ kind: "positional", index: Number(inner) });
    } else {
      slots.push({ kind: "named", name: inner });
    }
  }
  return slots;
}

export function etiquetaSlot(slot: ParamSlot): string {
  return slot.kind === "named" ? `{{${slot.name}}}` : `{{${slot.index}}}`;
}

function textoParametroValor(val: string, slot: ParamSlot): WhatsappSendParameter {
  const t = val.trim() === "" ? "—" : val;
  if (slot.kind === "named") {
    return { type: "text", text: t, parameter_name: slot.name };
  }
  return { type: "text", text: t };
}

export function extraerPlaceholders(components: WhatsappTemplateComponent[]): TemplatePlaceholders {
  const header = components.find((c) => c.type === "HEADER");
  const body = components.find((c) => c.type === "BODY");
  const footer = components.find((c) => c.type === "FOOTER");

  const headerFormat = header?.format ?? null;
  const headerComp =
    header && header.format === "TEXT" ? componenteDesdeTexto("header", header.text) : null;
  const bodyComp = componenteDesdeTexto("body", body?.text);
  const footerComp = componenteDesdeTexto("footer", footer?.text);

  const headerSlots =
    header && header.format === "TEXT" && header.text ? extraerSlotsDeTexto(header.text) : [];
  const bodySlots = body?.text ? extraerSlotsDeTexto(body.text) : [];
  const orderedSlots: ParamSlot[] = [...headerSlots, ...bodySlots];

  const legacyDigits = [
    ...(headerComp?.variables ?? []),
    ...(bodyComp?.variables ?? []),
    ...(footerComp?.variables ?? []),
  ];
  const totalVariables =
    orderedSlots.length > 0
      ? orderedSlots.length
      : legacyDigits.length > 0
        ? Math.max(...legacyDigits)
        : 0;

  return {
    header: headerComp,
    body: bodyComp,
    footer: footerComp,
    headerFormat,
    totalVariables,
    orderedSlots,
  };
}

export type TemplateNormalizado = {
  name: string;
  language: string;
  category: WhatsappTemplate["category"];
  status: WhatsappTemplate["status"];
  placeholders: TemplatePlaceholders;
};

export function normalizarTemplate(t: WhatsappTemplate): TemplateNormalizado {
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    status: t.status,
    placeholders: extraerPlaceholders(t.components ?? []),
  };
}

type MediaHeaderEnvio = { tipo: "image" | "video" | "document"; link: string; filename?: string } | null;

/**
 * Arma `components` para POST template: respeta header multimedia vs texto, body y footer, y nombres de parámetro Meta.
 */
export function construirComponentesTemplateEnvio(
  template: Pick<WhatsappTemplate, "components">,
  valores: string[],
  mediaHeader: MediaHeaderEnvio,
): WhatsappSendComponent[] {
  const componentsMeta = template.components ?? [];
  const headerComp = componentsMeta.find((c) => c.type === "HEADER");
  const bodyComp = componentsMeta.find((c) => c.type === "BODY");

  let i = 0;
  const out: WhatsappSendComponent[] = [];

  const fmt = headerComp?.format;
  if (
    headerComp &&
    fmt &&
    ["IMAGE", "VIDEO", "DOCUMENT"].includes(fmt) &&
    mediaHeader
  ) {
    let param: WhatsappSendParameter;
    if (mediaHeader.tipo === "image") {
      param = { type: "image", image: { link: mediaHeader.link } };
    } else if (mediaHeader.tipo === "video") {
      param = { type: "video", video: { link: mediaHeader.link } };
    } else {
      param = {
        type: "document",
        document: { link: mediaHeader.link, filename: mediaHeader.filename ?? "adjunto" },
      };
    }
    out.push({ type: "header", parameters: [param] });
  } else if (headerComp?.format === "TEXT" && headerComp.text) {
    const slots = extraerSlotsDeTexto(headerComp.text);
    if (slots.length) {
      const params = slots.map((slot) => textoParametroValor(valores[i++] ?? "", slot));
      out.push({ type: "header", parameters: params });
    }
  }

  if (bodyComp?.text) {
    const slots = extraerSlotsDeTexto(bodyComp.text);
    if (slots.length) {
      const params = slots.map((slot) => textoParametroValor(valores[i++] ?? "", slot));
      out.push({ type: "body", parameters: params });
    }
  }

  return out;
}

/**
 * Reemplaza `{{1}}..{{n}}` por los valores dados. Si falta una variable, deja placeholder.
 */
export function renderizarTextoConVariables(texto: string, valores: string[]): string {
  return texto.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, numStr: string) => {
    const idx = Number(numStr) - 1;
    const v = valores[idx];
    return typeof v === "string" ? v : `{{${numStr}}}`;
  });
}
