import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseCsvConEncabezados } from "@/lib/csv-utils";
import { esTelefonoUyValido, normalizarTelefonoWaUruguay } from "@/lib/telefono-wa-uruguay";
import {
  detectarMapeoContactosCsv,
  nombreDesdeFila,
  notasDesdeFila,
  optedOutDesdeFila,
  tagsDesdeFila,
  validarMapeoContactosCsv,
  type MapeoColumnasContacto,
} from "@/lib/whatsapp-contactos-csv";

export type { MapeoColumnasContacto };
export { detectarMapeoContactosCsv } from "@/lib/whatsapp-contactos-csv";

export type ContactoWhatsapp = {
  id: string;
  nombre: string;
  telefono: string;
  tags: string[];
  notas: string;
  fecha_creacion: string;
  ultimo_mensaje: string | null;
  opted_out: boolean;
  opted_out_at: string | null;
};

export type ContactoInput = {
  nombre: string;
  telefono: string;
  tags?: string[];
  notas?: string;
};

export type ResumenImportCsv = {
  creados: number;
  duplicados: number;
  invalidos: { fila: number; motivo: string }[];
};

function normalizarTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function limpiarTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  return Array.from(new Set(tags.map(normalizarTag).filter(Boolean)));
}

export async function listarContactos(options: {
  q?: string;
  tags?: string[];
  orden?: "nombre" | "fecha_creacion" | "ultimo_mensaje";
  direccion?: "asc" | "desc";
  optOut?: "todos" | "activos" | "baja";
}): Promise<ContactoWhatsapp[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("whatsapp_contacts").select("*");

  const q = options.q?.trim();
  if (q) {
    query = query.or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`);
  }

  const tags = options.tags?.filter(Boolean).map(normalizarTag);
  if (tags && tags.length > 0) {
    query = query.contains("tags", tags);
  }

  if (options.optOut === "activos") {
    query = query.eq("opted_out", false);
  } else if (options.optOut === "baja") {
    query = query.eq("opted_out", true);
  }

  const orden = options.orden ?? "fecha_creacion";
  const direccion = options.direccion ?? "desc";
  query = query.order(orden, { ascending: direccion === "asc", nullsFirst: false });

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron listar contactos: ${error.message}`);
  return (data ?? []) as ContactoWhatsapp[];
}

export async function obtenerContactoPorTelefono(telefono: string): Promise<ContactoWhatsapp | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_contacts")
    .select("*")
    .eq("telefono", telefono)
    .maybeSingle<ContactoWhatsapp>();
  if (error) throw new Error(`No se pudo leer contacto: ${error.message}`);
  return data;
}

export async function crearContacto(input: ContactoInput): Promise<ContactoWhatsapp> {
  const telefono = normalizarTelefonoWaUruguay(input.telefono);
  if (!telefono || !esTelefonoUyValido(telefono)) {
    throw new Error("Teléfono inválido para Uruguay (esperado +598 + 8/9 dígitos).");
  }
  const supabase = getSupabaseAdmin();
  const payload = {
    nombre: input.nombre?.trim() ?? "",
    telefono,
    tags: limpiarTags(input.tags),
    notas: input.notas?.trim() ?? "",
  };
  const { data, error } = await supabase
    .from("whatsapp_contacts")
    .insert(payload)
    .select("*")
    .single<ContactoWhatsapp>();
  if (error) {
    if (error.code === "23505") throw new Error("Ya existe un contacto con ese teléfono.");
    throw new Error(`No se pudo crear contacto: ${error.message}`);
  }
  return data;
}

export async function actualizarContacto(
  id: string,
  cambios: Partial<ContactoInput> & { opted_out?: boolean },
): Promise<ContactoWhatsapp> {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) patch.nombre = cambios.nombre.trim();
  if (cambios.tags !== undefined) patch.tags = limpiarTags(cambios.tags);
  if (cambios.notas !== undefined) patch.notas = cambios.notas.trim();
  if (cambios.telefono !== undefined) {
    const tel = normalizarTelefonoWaUruguay(cambios.telefono);
    if (!tel || !esTelefonoUyValido(tel)) throw new Error("Teléfono inválido.");
    patch.telefono = tel;
  }
  if (cambios.opted_out !== undefined) {
    patch.opted_out = cambios.opted_out;
    patch.opted_out_at = cambios.opted_out ? new Date().toISOString() : null;
  }
  const { data, error } = await supabase
    .from("whatsapp_contacts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single<ContactoWhatsapp>();
  if (error) throw new Error(`No se pudo actualizar contacto: ${error.message}`);
  return data;
}

export async function eliminarContacto(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("whatsapp_contacts").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar contacto: ${error.message}`);
}

export async function importarContactosCsv(
  csv: string,
  mapeoEnviado?: MapeoColumnasContacto | null,
): Promise<ResumenImportCsv> {
  const { encabezados, filas } = parseCsvConEncabezados(csv);
  if (encabezados.length === 0) {
    throw new Error("CSV vacío.");
  }
  const mapeo =
    mapeoEnviado != null
      ? validarMapeoContactosCsv(mapeoEnviado, encabezados.length)
      : detectarMapeoContactosCsv(encabezados);
  if (!mapeo) {
    throw new Error(
      'No se detectó columna de teléfono. Usá «telefono», «WhatsApp Number» o mapeá columnas en el diálogo.',
    );
  }

  const supabase = getSupabaseAdmin();
  const resumen: ResumenImportCsv = { creados: 0, duplicados: 0, invalidos: [] };
  const aInsertar: {
    nombre: string;
    telefono: string;
    tags: string[];
    notas: string;
    opted_out: boolean;
    opted_out_at: string | null;
  }[] = [];
  const vistosEnLote = new Set<string>();

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 2;
    const telRaw = fila[mapeo.telefono]?.trim() ?? "";
    const telefono = normalizarTelefonoWaUruguay(telRaw);
    if (!telefono || !esTelefonoUyValido(telefono)) {
      resumen.invalidos.push({ fila: numeroFila, motivo: `Teléfono inválido: "${telRaw}"` });
      continue;
    }
    if (vistosEnLote.has(telefono)) {
      resumen.duplicados += 1;
      continue;
    }
    vistosEnLote.add(telefono);
    const nombre = nombreDesdeFila(fila, mapeo);
    const tags = limpiarTags(tagsDesdeFila(fila, mapeo));
    const notas = notasDesdeFila(fila, mapeo);
    const optedOut = optedOutDesdeFila(fila, mapeo);
    aInsertar.push({
      nombre,
      telefono,
      tags,
      notas,
      opted_out: optedOut,
      opted_out_at: optedOut ? new Date().toISOString() : null,
    });
  }

  if (aInsertar.length === 0) return resumen;

  const telefonos = aInsertar.map((c) => c.telefono);
  const { data: existentes } = await supabase
    .from("whatsapp_contacts")
    .select("telefono")
    .in("telefono", telefonos);
  const yaExisten = new Set((existentes ?? []).map((e: { telefono: string }) => e.telefono));

  const nuevos = aInsertar.filter((c) => {
    if (yaExisten.has(c.telefono)) {
      resumen.duplicados += 1;
      return false;
    }
    return true;
  });

  if (nuevos.length === 0) return resumen;

  const { error, count } = await supabase
    .from("whatsapp_contacts")
    .insert(nuevos, { count: "exact" });
  if (error) throw new Error(`No se pudo importar: ${error.message}`);
  resumen.creados = count ?? nuevos.length;
  return resumen;
}

export async function listarTagsDistinct(): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("whatsapp_contacts").select("tags");
  if (error) throw new Error(`No se pudieron listar tags: ${error.message}`);
  const set = new Set<string>();
  for (const fila of (data ?? []) as { tags: string[] }[]) {
    for (const tag of fila.tags ?? []) {
      const t = normalizarTag(tag);
      if (t) set.add(t);
    }
  }
  return Array.from(set).sort();
}
