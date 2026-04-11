import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseServidor } from "@/lib/supabase-servidor";

/**
 * Verifica sesión + rol admin en rutas API (el middleware no cubre /api).
 */
export async function requireAdminApi(): Promise<
  { ok: true } | { ok: false; status: number; message: string }
> {
  const supabaseServidor = await getSupabaseServidor();
  const {
    data: { user },
    error: authError,
  } = await supabaseServidor.auth.getUser();
  if (authError || !user) {
    return { ok: false, status: 401, message: "Sesión inválida." };
  }
  const supabaseAdmin = getSupabaseAdmin();
  const { data: perfil, error: perfilError } = await supabaseAdmin
    .from("perfiles_usuarios")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();
  if (perfilError) {
    return { ok: false, status: 500, message: perfilError.message };
  }
  if (perfil?.rol !== "admin") {
    return { ok: false, status: 403, message: "Solo administradores." };
  }
  return { ok: true };
}
