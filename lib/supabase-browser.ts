import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Preferencia de cookies: sesión del navegador vs persistencia larga ("Recordarme"). */
export const AUTH_REMEMBER_STORAGE_KEY = "cm_auth_remember";

const MAX_AGE_RECUERDAME_SEG = 60 * 60 * 24 * 400;

let clienteBrowser: SupabaseClient | null = null;
let modoCliente: "" | "persistente" | "sesion" = "";

function modoCookiesDesdeStorage(): "persistente" | "sesion" {
  if (typeof window === "undefined") {
    return "sesion";
  }
  const v =
    window.localStorage.getItem(AUTH_REMEMBER_STORAGE_KEY) ??
    window.sessionStorage.getItem(AUTH_REMEMBER_STORAGE_KEY);
  return v === "1" ? "persistente" : "sesion";
}

function opcionesCookieBase() {
  const https = typeof window !== "undefined" && window.location.protocol === "https:";
  return {
    path: "/",
    sameSite: "lax" as const,
    ...(https ? { secure: true as const } : {}),
  };
}

/**
 * Fuerza a recrear el cliente en el próximo `getSupabaseBrowser()` (p. ej. tras cambiar "Recordarme" o cerrar sesión).
 */
export function resetSupabaseBrowser() {
  clienteBrowser = null;
  modoCliente = "";
}

export function getSupabaseBrowser() {
  const modo = modoCookiesDesdeStorage();
  if (clienteBrowser && modoCliente === modo) {
    return clienteBrowser;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Faltan variables NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const base = opcionesCookieBase();
  const cookieOptions =
    modo === "persistente"
      ? { ...base, maxAge: MAX_AGE_RECUERDAME_SEG }
      : { ...base };

  clienteBrowser = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    isSingleton: false,
    cookieOptions,
  });
  modoCliente = modo;
  return clienteBrowser;
}
