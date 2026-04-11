import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let clienteBrowser: SupabaseClient | null = null;

export function getSupabaseBrowser() {
  if (clienteBrowser) {
    return clienteBrowser;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Faltan variables NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  // Usamos cliente SSR para que la sesion viva en cookies y middleware la pueda leer.
  clienteBrowser = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return clienteBrowser;
}
