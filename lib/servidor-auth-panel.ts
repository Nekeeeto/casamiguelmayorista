import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseServidor } from "@/lib/supabase-servidor";
import { rolEsAdmin, rolPuedeInventarioPedidos } from "@/lib/rol-panel";

export async function requireAdminOrShopManagerActor(): Promise<{ actorId: string }> {
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
  if (!rolPuedeInventarioPedidos(perfil?.rol)) {
    throw new Error("Solo personal autorizado del panel puede realizar esta acción.");
  }
  return { actorId: user.id };
}

export async function requireStrictAdminActor(): Promise<{ actorId: string }> {
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
  if (!rolEsAdmin(perfil?.rol)) {
    throw new Error("Solo los administradores pueden realizar esta acción.");
  }
  return { actorId: user.id };
}
