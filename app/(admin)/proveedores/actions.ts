"use server";

import { revalidatePath } from "next/cache";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseServidor } from "@/lib/supabase-servidor";

type CampoProveedor =
  | "nombre_fantasia"
  | "rut"
  | "email"
  | "telefono"
  | "contacto"
  | "notas"
  | "logo_url";

type ProveedorPayload = {
  nombre_fantasia: string;
  rut?: string;
  email?: string;
  telefono?: string;
  contacto?: string;
  notas?: string;
  logo_url?: string;
};

async function requireAdminActor() {
  const supabaseServidor = await getSupabaseServidor();
  const {
    data: { user },
    error: authError,
  } = await supabaseServidor.auth.getUser();
  if (authError || !user) {
    throw new Error("Sesión inválida.");
  }
  const supabaseAdmin = getSupabaseAdmin();
  const { data: perfil, error: perfilError } = await supabaseAdmin
    .from("perfiles_usuarios")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();
  if (perfilError) {
    throw new Error(perfilError.message);
  }
  if (perfil?.rol !== "admin") {
    throw new Error("Solo administradores.");
  }
}

function revalidarProveedores() {
  revalidatePath("/proveedores");
  revalidatePath("/inventario");
  revalidatePath("/admin");
  revalidatePath("/admin/inventario");
}

export type ResultadoCrearProveedor =
  | { ok: true; proveedor: { id: string; nombre_fantasia: string; rut: string | null; contacto: string | null; telefono: string | null; email: string | null; logo_url: string | null; productos_totales: number } }
  | { ok: false; error: string };

export async function crearProveedorAction(payload: ProveedorPayload): Promise<ResultadoCrearProveedor> {
  try {
    await requireAdminActor();
    const nombre = String(payload.nombre_fantasia ?? "").trim();
    if (!nombre) {
      return { ok: false, error: "El nombre del proveedor es obligatorio." };
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("proveedores")
      .insert({
        nombre_fantasia: nombre,
        logo_url: String(payload.logo_url ?? "").trim() || null,
        rut: String(payload.rut ?? "").trim() || null,
        email: String(payload.email ?? "").trim() || null,
        telefono: String(payload.telefono ?? "").trim() || null,
        contacto: String(payload.contacto ?? "").trim() || null,
        notas: String(payload.notas ?? "").trim() || null,
      })
      .select("id, nombre_fantasia, rut, contacto, telefono, email, logo_url")
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidarProveedores();
    const proveedorCreado = data as {
      id: string;
      nombre_fantasia: string;
      rut: string | null;
      contacto: string | null;
      telefono: string | null;
      email: string | null;
      logo_url: string | null;
    };
    return {
      ok: true,
      proveedor: {
        ...proveedorCreado,
        productos_totales: 0,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo crear el proveedor.",
    };
  }
}

export type ResultadoActualizarProveedor =
  | { ok: true }
  | { ok: false; error: string };

export async function actualizarCampoProveedorAction(
  proveedorId: string,
  campo: CampoProveedor,
  valor: string | null,
): Promise<ResultadoActualizarProveedor> {
  try {
    await requireAdminActor();
    const id = String(proveedorId ?? "").trim();
    if (!id) {
      return { ok: false, error: "Proveedor inválido." };
    }

    if (!["nombre_fantasia", "rut", "email", "telefono", "contacto", "notas", "logo_url"].includes(campo)) {
      return { ok: false, error: "Campo inválido." };
    }

    const texto = String(valor ?? "").trim();
    if (campo === "nombre_fantasia" && !texto) {
      return { ok: false, error: "El nombre del proveedor no puede quedar vacío." };
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("proveedores")
      .update({ [campo]: texto || null })
      .eq("id", id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidarProveedores();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo actualizar el proveedor.",
    };
  }
}
