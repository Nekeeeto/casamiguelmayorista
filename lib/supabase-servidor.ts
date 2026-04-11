import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getSupabaseServidor() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Faltan variables NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const almacenCookies = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return almacenCookies.getAll();
      },
      setAll(cookiesParaEstablecer) {
        try {
          cookiesParaEstablecer.forEach(({ name, value, options }) =>
            almacenCookies.set(name, value, options),
          );
        } catch {
          // Server Actions: set puede fallar en algunos contextos
        }
      },
    },
  });
}
