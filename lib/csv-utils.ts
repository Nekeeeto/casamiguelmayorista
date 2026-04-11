/** Una línea CSV con campos entre comillas y comas internas. */
export function parseLineaCsv(linea: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      entreComillas = !entreComillas;
    } else if (c === "," && !entreComillas) {
      celdas.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  celdas.push(actual);
  return celdas.map((s) => s.trim());
}

/**
 * Interpreta costo: soporta coma decimal (124,5), miles europeos (1.234,56) y punto decimal US (12.99).
 * Antes: solo quitaba todos los puntos → "12.99" se leía mal como 1299.
 */
export function parseCostoCelda(celda: string): number | null {
  let s = celda.replace(/"/g, "").replace(/UYU/gi, "").replace(/\u00a0/g, " ").trim();
  if (!s) {
    return null;
  }
  s = s.replace(/\s/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastComma > lastDot) {
    // Coma es el separador decimal (estilo 1.234,56 o 12,5)
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0 && lastDot > lastComma) {
    // Punto es el último separador: decimal US (12.99) o miles (1.000.000)
    const dotCount = (s.match(/\./g) ?? []).length;
    if (dotCount > 1) {
      normalized = s.replace(/\./g, "");
    } else {
      normalized = s;
    }
  } else if (lastComma >= 0) {
    normalized = s.replace(",", ".");
  } else {
    normalized = s;
  }
  const n = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Number(n.toFixed(2));
}

export function quitarBomTexto(texto: string): string {
  if (texto.charCodeAt(0) === 0xfeff) {
    return texto.slice(1);
  }
  return texto;
}

/** Primera fila = encabezados; el resto son filas de datos (sin filtrar vacías). */
export function parseCsvConEncabezados(texto: string): { encabezados: string[]; filas: string[][] } {
  const limpio = quitarBomTexto(texto);
  const lineas = limpio.split(/\r?\n/).filter((l) => l.length > 0);
  if (lineas.length === 0) {
    return { encabezados: [], filas: [] };
  }
  const encabezados = parseLineaCsv(lineas[0]);
  const filas = lineas.slice(1).map(parseLineaCsv);
  return { encabezados, filas };
}

/** Índice de columna por nombre exacto del encabezado (trim). */
export function indiceColumna(encabezados: string[], nombreElegido: string): number {
  const objetivo = nombreElegido.trim();
  return encabezados.findIndex((h) => h.trim() === objetivo);
}
