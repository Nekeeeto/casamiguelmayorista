import type {
  WhatsappTemplate,
  WhatsappTemplateComponent,
  WhatsappSendComponent,
  WhatsappSendParameter,
} from "@/lib/whatsapp-cloud-api";

export type MediaHeaderEnvio =
  | { tipo: "image" | "video" | "document"; link: string; filename?: string }
  | null;

export type ParamSlot =
  | { kind: "positional"; index: number }
  | { kind: "named"; name: string };

export type ComponentePlaceholder = {
  tipo: "header" | "body" | "footer";
  texto: string;
  variables: number[];
};

/** Botón URL cuya `url` en la plantilla incluye `{{…}}` — al enviar hace falta el sufijo en `components.button`. */
export type TemplateUrlButtonDinamico = {
  /** Índice del botón en el componente BUTTONS (string en API Meta: "0", "1", …). */
  indiceEnPlantilla: number;
  titulo: string;
  urlEnPlantilla: string;
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
  /** Cantidad de slots en HEADER tipo TEXT (para repartir `valores` header/body). */
  headerSlotCount: number;
  urlButtonsDinamicos: TemplateUrlButtonDinamico[];
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

function normalizarTipoBoton(t: unknown): string {
  return String(t ?? "").toUpperCase();
}

/**
 * Botones URL con al menos un `{{` en `url` requieren parámetro de texto al enviar (sufijo).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
 */
export function extraerBotonesUrlDinamicos(components: WhatsappTemplateComponent[]): TemplateUrlButtonDinamico[] {
  const btnComp = components.find((c) => c.type === "BUTTONS");
  const raw = btnComp?.buttons;
  if (!Array.isArray(raw)) return [];
  const out: TemplateUrlButtonDinamico[] = [];
  raw.forEach((b, indiceEnPlantilla) => {
    if (!b || typeof b !== "object") return;
    const o = b as Record<string, unknown>;
    if (normalizarTipoBoton(o.type) !== "URL") return;
    const url = typeof o.url === "string" ? o.url : "";
    if (!url.includes("{{")) return;
    const titulo = typeof o.text === "string" && o.text.trim() ? o.text.trim() : `URL ${indiceEnPlantilla + 1}`;
    out.push({ indiceEnPlantilla, titulo, urlEnPlantilla: url });
  });
  return out;
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

  const urlButtonsDinamicos = extraerBotonesUrlDinamicos(components);

  return {
    header: headerComp,
    body: bodyComp,
    footer: footerComp,
    headerFormat,
    totalVariables,
    orderedSlots,
    headerSlotCount: headerSlots.length,
    urlButtonsDinamicos,
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

/** Clave en `variable_mapping` para el sufijo del botón URL dinámico (índice en plantilla Meta). */
export function claveMapeoBotonUrl(indiceEnPlantilla: number): string {
  return `btn_url_${indiceEnPlantilla}`;
}

/**
 * Resuelve valores en orden `orderedSlots` usando claves `String(slot.index)` o `slot.name` (nombrados).
 */
export function valoresSlotsDesdeMapeo(
  placeholders: Pick<TemplatePlaceholders, "orderedSlots">,
  mapping: Record<string, string>,
  resolver: (campo: string) => string,
): string[] {
  return placeholders.orderedSlots.map((slot) => {
    const key = slot.kind === "positional" ? String(slot.index) : slot.name;
    const campo = mapping[key]?.trim() ? mapping[key] : "";
    return campo ? resolver(campo.trim()) : "";
  });
}

export function sufijosBotonUrlDesdeMapeo(
  urlButtons: readonly TemplateUrlButtonDinamico[],
  mapping: Record<string, string>,
  resolver: (campo: string) => string,
): string[] {
  return urlButtons.map((b) => {
    const campo = mapping[claveMapeoBotonUrl(b.indiceEnPlantilla)]?.trim() ?? "";
    return campo ? resolver(campo) : "";
  });
}

export function construirValoresTemplateCompleto(
  components: WhatsappTemplateComponent[],
  mapping: Record<string, string>,
  resolver: (campo: string) => string,
): { valores: string[]; error: string | null } {
  const ph = extraerPlaceholders(components);
  const vals = valoresSlotsDesdeMapeo(ph, mapping, resolver);
  const suf = sufijosBotonUrlDesdeMapeo(ph.urlButtonsDinamicos, mapping, resolver);
  for (let j = 0; j < ph.urlButtonsDinamicos.length; j++) {
    if (!suf[j]?.trim()) {
      return {
        valores: [],
        error: `Falta mapeo del botón URL «${ph.urlButtonsDinamicos[j]?.titulo ?? "CTA"}» (${claveMapeoBotonUrl(ph.urlButtonsDinamicos[j]?.indiceEnPlantilla ?? 0)} → campo de datos).`,
      };
    }
  }
  return { valores: [...vals, ...suf], error: null };
}

/**
 * `valores` = valores de header+body en orden `orderedSlots`, concatenados con sufijos URL en orden `urlButtonsDinamicos`.
 */
export function construirComponentesTemplateEnvio(
  template: Pick<WhatsappTemplate, "components">,
  valores: string[],
  mediaHeader: MediaHeaderEnvio,
): WhatsappSendComponent[] {
  const componentsMeta = template.components ?? [];
  const ph = extraerPlaceholders(componentsMeta);
  const slotN = ph.orderedSlots.length;
  const urlBtns = ph.urlButtonsDinamicos;
  const valoresSlots = valores.slice(0, slotN);
  const sufijos = valores.slice(slotN, slotN + urlBtns.length);

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
      const params = slots.map((slot) => textoParametroValor(valoresSlots[i++] ?? "", slot));
      out.push({ type: "header", parameters: params });
    }
  }

  if (bodyComp?.text) {
    const slots = extraerSlotsDeTexto(bodyComp.text);
    if (slots.length) {
      const params = slots.map((slot) => textoParametroValor(valoresSlots[i++] ?? "", slot));
      out.push({ type: "body", parameters: params });
    }
  }

  urlBtns.forEach((btn, j) => {
    const suffix = (sufijos[j] ?? "").trim();
    if (!suffix) return;
    out.push({
      type: "button",
      sub_type: "url",
      index: String(btn.indiceEnPlantilla),
      parameters: [{ type: "text", text: suffix }],
    });
  });

  return out;
}

/** Base URL estática antes del placeholder final (preview). */
export function baseUrlBotonDinamico(urlEnPlantilla: string): string {
  return urlEnPlantilla.replace(/\{\{\s*[^}]+\s*\}\}\s*$/u, "").trim();
}

/**
 * Aplica valores a un texto con `{{n}}` o `{{nombre}}` según slots del fragmento.
 */
export function aplicarSlotsATexto(texto: string, slots: ParamSlot[], valores: string[]): string {
  let result = texto;
  slots.forEach((slot, idx) => {
    const tag = etiquetaSlot(slot);
    const val = valores[idx] ?? "";
    result = result.split(tag).join(val);
  });
  return result;
}

/**
 * True si Meta exige enviar parámetro de cabecera multimedia al disparar el template.
 */
export function plantillaRequiereCabeceraMultimedia(
  template: Pick<WhatsappTemplate, "components">,
): boolean {
  const headerComp = template.components?.find((c) => c.type === "HEADER");
  const fmt = headerComp?.format;
  return fmt != null && ["IMAGE", "VIDEO", "DOCUMENT"].includes(fmt);
}

/**
 * Convierte URL guardada en el payload `components` del envío (solo si el template tiene header multimedia).
 */
export function resolverMediaHeaderEnvio(
  template: Pick<WhatsappTemplate, "components">,
  url: string | null | undefined,
): MediaHeaderEnvio {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) return null;
  const headerComp = template.components?.find((c) => c.type === "HEADER");
  const fmt = headerComp?.format;
  if (fmt === "IMAGE") return { tipo: "image", link: trimmed };
  if (fmt === "VIDEO") return { tipo: "video", link: trimmed };
  if (fmt === "DOCUMENT") return { tipo: "document", link: trimmed, filename: "adjunto" };
  return null;
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
