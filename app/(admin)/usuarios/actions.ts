"use server";

import { revalidatePath } from "next/cache";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function aprobarUsuarioAction(formData: FormData) {
  const idUsuario = String(formData.get("id_usuario") ?? "");

  if (!idUsuario) {
    throw new Error("No se recibio el identificador del usuario.");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("perfiles_usuarios")
    .update({ rol: "aprobado" })
    .eq("id", idUsuario);

  if (error) {
    throw new Error(error.message);
  }

  // Placeholder para email transaccional de cuenta aprobada.
  console.info("TODO: enviar email de aprobacion a usuario", { idUsuario });

  revalidatePath("/usuarios");
  revalidatePath("/admin/usuarios");
}
