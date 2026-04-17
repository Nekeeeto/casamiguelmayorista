import type { WhatsappTemplateComponent } from "@/lib/whatsapp-cloud-api";

export type CategoriaPlantillaMeta = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export type EncabezadoPlantillaForm = { tipo: "none" } | { tipo: "text"; texto: string };

export type BotonUrlPlantillaForm = {
  texto: string;
  url: string;
  ejemploUrl: string;
};

export type FormCrearPlantillaMeta = {
  nombre: string;
  idioma: string;
  categoria: CategoriaPlantillaMeta;
  encabezado: EncabezadoPlantillaForm;
  cuerpo: string;
  pie: string;
  boton: BotonUrlPlantillaForm | null;
  /** Valor de muestra para cada {{n}} usado en la plantilla (clave = n). */
  muestras: Record<number, string>;
};

export function validarNombrePlantillaMeta(nombre: string): string | null {
  const t = nombre.trim();
  if (t.length < 1 || t.length > 512) return "El nombre debe tener entre 1 y 512 caracteres.";
  if (!/^[a-z0-9_]+$/.test(t)) return "Solo minúsculas, números y guiones bajos (sin espacios).";
  return null;
}

export function indicesVariablesEnOrden(texto: string): number[] {
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  const orden: number[] = [];
  const visto = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1) continue;
    if (!visto.has(n)) {
      visto.add(n);
      orden.push(n);
    }
  }
  return orden;
}

function muestrasLineaComponente(texto: string, muestras: Record<number, string>): string[] {
  return indicesVariablesEnOrden(texto).map((i) => {
    const v = muestras[i]?.trim();
    return v ?? "";
  });
}

function indicesUsadosGlobales(partes: string[]): number[] {
  const s = new Set<number>();
  for (const p of partes) {
    for (const n of indicesVariablesEnOrden(p)) {
      s.add(n);
    }
  }
  return Array.from(s).sort((a, b) => a - b);
}

export function validarMuestrasCompletas(form: FormCrearPlantillaMeta): string | null {
  const headerText =
    form.encabezado.tipo === "text" ? form.encabezado.texto.trim() : "";
  const body = form.cuerpo.trim();
  const footer = form.pie.trim();
  const urlBtn = form.boton?.url.trim() ?? "";

  if (!body) return "El cuerpo del mensaje es obligatorio.";
  if (indicesVariablesEnOrden(footer).length > 0) {
    return "El pie no puede tener {{variables}} en este generador; usá texto fijo o sacá los marcadores.";
  }

  const partes = [headerText, body, urlBtn].filter((p) => p.length > 0);
  const usados = indicesUsadosGlobales(partes);
  for (const n of usados) {
    const m = form.muestras[n]?.trim();
    if (!m) return `Falta texto de ejemplo para {{${n}}} (Meta lo exige para aprobar la plantilla).`;
  }
  if (form.boton?.url.trim()) {
    const u = form.boton.url.trim();
    if (indicesVariablesEnOrden(u).length > 0 && !form.boton.ejemploUrl.trim()) {
      return "Si la URL del botón tiene {{n}}, completá «Ejemplo de URL» con un link completo.";
    }
  }
  return null;
}

/**
 * Arma `components` para POST `/{waba-id}/message_templates` (orden: HEADER, BODY, FOOTER, BUTTONS).
 */
export function construirComponentesPlantillaMeta(form: FormCrearPlantillaMeta): WhatsappTemplateComponent[] {
  const out: WhatsappTemplateComponent[] = [];

  if (form.encabezado.tipo === "text") {
    const texto = form.encabezado.texto.trim();
    if (texto) {
      const header: WhatsappTemplateComponent = {
        type: "HEADER",
        format: "TEXT",
        text: texto,
      };
      const vars = indicesVariablesEnOrden(texto);
      if (vars.length > 0) {
        header.example = { header_text: muestrasLineaComponente(texto, form.muestras) };
      }
      out.push(header);
    }
  }

  const bodyText = form.cuerpo.trim();
  const body: WhatsappTemplateComponent = { type: "BODY", text: bodyText };
  const bodyVars = indicesVariablesEnOrden(bodyText);
  if (bodyVars.length > 0) {
    body.example = { body_text: [muestrasLineaComponente(bodyText, form.muestras)] };
  }
  out.push(body);

  const pie = form.pie.trim();
  if (pie) {
    out.push({ type: "FOOTER", text: pie });
  }

  if (form.boton && form.boton.texto.trim() && form.boton.url.trim()) {
    const url = form.boton.url.trim();
    const uv = indicesVariablesEnOrden(url);
    const ejemplo =
      uv.length > 0 ? form.boton.ejemploUrl.trim() : form.boton.ejemploUrl.trim() || url;
    out.push({
      type: "BUTTONS",
      buttons: [
        {
          type: "URL",
          text: form.boton.texto.trim().slice(0, 25),
          url,
          example: [ejemplo],
        },
      ],
    });
  }

  return out;
}

export function indicesVariablesPlantilla(form: Omit<FormCrearPlantillaMeta, "muestras">): number[] {
  const headerText =
    form.encabezado.tipo === "text" ? form.encabezado.texto.trim() : "";
  const url = form.boton?.url.trim() ?? "";
  return indicesUsadosGlobales([headerText, form.cuerpo.trim(), url]);
}

export function formularioDesdeComponentesMeta(components: WhatsappTemplateComponent[]): Pick<
  FormCrearPlantillaMeta,
  "encabezado" | "cuerpo" | "pie" | "boton"
> {
  const header = components.find((c) => c.type === "HEADER");
  const body = components.find((c) => c.type === "BODY");
  const footer = components.find((c) => c.type === "FOOTER");
  const buttons = components.find((c) => c.type === "BUTTONS");

  let encabezado: EncabezadoPlantillaForm = { tipo: "none" };
  if (header?.format === "TEXT" && header.text?.trim()) {
    encabezado = { tipo: "text", texto: header.text };
  }

  const cuerpo = body?.text ?? "";
  const pie = footer?.text ?? "";

  let boton: BotonUrlPlantillaForm | null = null;
  const raw = buttons?.buttons?.[0];
  if (raw && typeof raw === "object" && raw !== null) {
    const b = raw as { type?: string; text?: string; url?: string; example?: string[] };
    if (b.type === "URL" && b.text && b.url) {
      boton = { texto: b.text, url: b.url, ejemploUrl: b.example?.[0] ?? "" };
    }
  }

  return { encabezado, cuerpo, pie, boton };
}
