/** CSV de contactos: aliases (WANotifier, export propio, etc.) y tipo de mapeo para import. */

export type MapeoColumnasContacto = {
  telefono: number;
  nombre?: number;
  firstName?: number;
  lastName?: number;
  tags?: number;
  notas?: number;
  status?: number;
  listName?: number;
};

export function normalizarEncabezadoCsv(h: string): string {
  return h
    .trim()
    .replace(/^"|"$/g, "")
    .trim()
    .toLowerCase();
}

function indicePorCandidatos(encabezados: string[], candidatos: string[]): number {
  const norm = encabezados.map(normalizarEncabezadoCsv);
  const set = new Set(candidatos.map(normalizarEncabezadoCsv));
  for (let i = 0; i < norm.length; i++) {
    if (set.has(norm[i])) return i;
  }
  return -1;
}

function indiceColumnaTelefono(encabezados: string[]): number {
  const porNombre = indicePorCandidatos(encabezados, [
    "telefono",
    "teléfono",
    "tel",
    "whatsapp number",
    "phone",
    "mobile",
    "celular",
    "número",
    "numero",
    "número whatsapp",
    "numero whatsapp",
    "whatsapp_phone",
    "wa number",
  ]);
  if (porNombre >= 0) return porNombre;
  const norm = encabezados.map(normalizarEncabezadoCsv);
  for (let i = 0; i < norm.length; i++) {
    const h = norm[i];
    if (h.includes("whatsapp") && h.includes("number")) return i;
  }
  return -1;
}

export function detectarMapeoContactosCsv(encabezados: string[]): MapeoColumnasContacto | null {
  const telefono = indiceColumnaTelefono(encabezados);
  if (telefono < 0) return null;

  const m: MapeoColumnasContacto = { telefono };

  const idxNombre = indicePorCandidatos(encabezados, [
    "nombre",
    "name",
    "full name",
    "contact name",
    "display name",
    "razón social",
    "razon social",
  ]);
  const idxFirst = indicePorCandidatos(encabezados, ["first name", "firstname", "given name", "nombre pila"]);
  const idxLast = indicePorCandidatos(encabezados, [
    "last name",
    "lastname",
    "surname",
    "family name",
    "apellido",
  ]);

  if (idxNombre >= 0) {
    m.nombre = idxNombre;
  } else {
    if (idxFirst >= 0) m.firstName = idxFirst;
    if (idxLast >= 0) m.lastName = idxLast;
  }

  const idxTags = indicePorCandidatos(encabezados, ["tags", "tag", "etiquetas", "labels"]);
  if (idxTags >= 0) m.tags = idxTags;

  const idxNotas = indicePorCandidatos(encabezados, ["notas", "notes", "note", "comentarios", "comments"]);
  if (idxNotas >= 0) m.notas = idxNotas;

  const idxStatus = indicePorCandidatos(encabezados, ["status", "estado", "subscription", "suscripción", "suscripcion"]);
  if (idxStatus >= 0) m.status = idxStatus;

  const idxList = indicePorCandidatos(encabezados, ["list name", "list", "lista", "list_name"]);
  if (idxList >= 0) m.listName = idxList;

  return m;
}

function indiceValido(n: number | undefined, max: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n < max;
}

function indiceOpcional(v: unknown, numColumnas: number, etiqueta: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= numColumnas) {
    throw new Error(`Índice inválido para ${etiqueta}.`);
  }
  return v;
}

export function validarMapeoContactosCsv(mapeo: unknown, numColumnas: number): MapeoColumnasContacto {
  if (!mapeo || typeof mapeo !== "object") {
    throw new Error("Mapeo de columnas inválido.");
  }
  const m = mapeo as Record<string, unknown>;
  const tel = m.telefono;
  if (typeof tel !== "number" || !Number.isInteger(tel) || tel < 0 || tel >= numColumnas) {
    throw new Error("La columna de teléfono es obligatoria y debe ser un índice válido.");
  }
  const out: MapeoColumnasContacto = { telefono: tel };
  const addField = (idx: number | undefined, label: string, set: (n: number) => void) => {
    if (idx === undefined) return;
    if (idx === tel) {
      throw new Error(`«${label}» no puede usar la misma columna que el teléfono.`);
    }
    set(idx);
  };
  addField(indiceOpcional(m.nombre, numColumnas, "nombre"), "nombre", (n) => {
    out.nombre = n;
  });
  addField(indiceOpcional(m.firstName, numColumnas, "first name"), "first name", (n) => {
    out.firstName = n;
  });
  addField(indiceOpcional(m.lastName, numColumnas, "last name"), "last name", (n) => {
    out.lastName = n;
  });
  addField(indiceOpcional(m.tags, numColumnas, "tags"), "tags", (n) => {
    out.tags = n;
  });
  addField(indiceOpcional(m.notas, numColumnas, "notas"), "notas", (n) => {
    out.notas = n;
  });
  addField(indiceOpcional(m.status, numColumnas, "estado"), "estado", (n) => {
    out.status = n;
  });
  addField(indiceOpcional(m.listName, numColumnas, "lista"), "lista", (n) => {
    out.listName = n;
  });
  return out;
}

export function nombreDesdeFila(fila: string[], mapeo: MapeoColumnasContacto): string {
  if (indiceValido(mapeo.nombre, fila.length)) {
    return fila[mapeo.nombre]?.trim() ?? "";
  }
  const fn = indiceValido(mapeo.firstName, fila.length) ? (fila[mapeo.firstName]?.trim() ?? "") : "";
  const ln = indiceValido(mapeo.lastName, fila.length) ? (fila[mapeo.lastName]?.trim() ?? "") : "";
  return [fn, ln].filter(Boolean).join(" ").trim();
}

export function tagsDesdeFila(fila: string[], mapeo: MapeoColumnasContacto): string[] {
  const partes: string[] = [];
  if (indiceValido(mapeo.tags, fila.length)) {
    const raw = fila[mapeo.tags] ?? "";
    partes.push(
      ...raw
        .split(/[|,]/)
        .map((t) => t.trim())
        .filter(Boolean),
    );
  }
  if (indiceValido(mapeo.listName, fila.length)) {
    const ln = fila[mapeo.listName]?.trim();
    if (ln) partes.push(ln);
  }
  return partes;
}

export function notasDesdeFila(fila: string[], mapeo: MapeoColumnasContacto): string {
  if (!indiceValido(mapeo.notas, fila.length)) return "";
  return fila[mapeo.notas]?.trim() ?? "";
}

export function optedOutDesdeFila(fila: string[], mapeo: MapeoColumnasContacto): boolean {
  if (!indiceValido(mapeo.status, fila.length)) return false;
  const s = (fila[mapeo.status] ?? "").trim().toLowerCase();
  return (
    s === "unsubscribed" ||
    s === "unsubscribe" ||
    s === "opted out" ||
    s === "opt-out" ||
    s === "baja" ||
    s === "cancelled" ||
    s === "canceled"
  );
}
