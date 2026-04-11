import type { SupabaseClient } from "@supabase/supabase-js";

function claveNombreProveedor(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Resuelve nombre fantasía → id; crea fila mínima en proveedores si no existe.
 */
export async function resolverOCrearProveedoresPorNombre(
  supabase: SupabaseClient,
  nombres: string[],
): Promise<{ idPorClave: Map<string, string>; creados: number }> {
  const idPorClave = new Map<string, string>();
  const unicos = [...new Set(nombres.map((n) => n.trim()).filter((n) => n.length > 0))];
  if (unicos.length === 0) {
    return { idPorClave, creados: 0 };
  }

  const { data: existentes, error: errSel } = await supabase
    .from("proveedores")
    .select("id, nombre_fantasia");

  if (errSel) {
    throw new Error(`proveedores: ${errSel.message}`);
  }

  for (const row of existentes ?? []) {
    const nf = String((row as { nombre_fantasia?: string }).nombre_fantasia ?? "").trim();
    const id = String((row as { id?: string }).id ?? "");
    if (!nf || !id) continue;
    idPorClave.set(claveNombreProveedor(nf), id);
  }

  let creados = 0;
  for (const nombre of unicos) {
    const key = claveNombreProveedor(nombre);
    if (idPorClave.has(key)) {
      continue;
    }
    const { data: ins, error: errIns } = await supabase
      .from("proveedores")
      .insert({
        nombre_fantasia: nombre.trim().replace(/\s+/g, " "),
      })
      .select("id")
      .single();

    if (errIns) {
      throw new Error(`No se pudo crear proveedor "${nombre}": ${errIns.message}`);
    }
    const nuevoId = String((ins as { id: string }).id);
    idPorClave.set(key, nuevoId);
    creados += 1;
  }

  return { idPorClave, creados };
}

export function proveedorIdParaNombre(
  idPorClave: Map<string, string>,
  nombreCelda: string | null | undefined,
): string | null {
  const t = String(nombreCelda ?? "").trim();
  if (!t) return null;
  return idPorClave.get(claveNombreProveedor(t)) ?? null;
}
