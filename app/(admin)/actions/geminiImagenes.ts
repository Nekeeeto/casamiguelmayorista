"use server";

import { generarImagenGemini31FlashDesdeReferencia } from "@/lib/gemini-image-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseServidor } from "@/lib/supabase-servidor";

export type ResultadoGeminiImagenGenerada =
  | {
      ok: true;
      imagen_base64: string;
      mime_type: string;
      mensaje_texto?: string;
    }
  | { ok: false; error: string };

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
    throw new Error("Solo los administradores pueden realizar esta acción.");
  }
}

function mimeDesdeArchivoGemini(archivo: File): string {
  const t = archivo.type?.toLowerCase() ?? "";
  if (t.includes("jpeg") || t.includes("jpg")) return "image/jpeg";
  if (t.includes("webp")) return "image/webp";
  if (t.includes("gif")) return "image/gif";
  if (t.includes("png")) return "image/png";
  return "image/png";
}

function resolverApiKeyGemini(formData: FormData): string {
  const desdeForm = String(formData.get("gemini_api_key") ?? "").trim();
  if (desdeForm) return desdeForm;
  return process.env.GEMINI_API_KEY?.trim() ?? "";
}

/**
 * Una generación por llamada (referencia + prompt). Los modales de producto y galería usan la misma acción con distintos prompts.
 */
export async function geminiGenerarImagenDesdeReferencia(
  formData: FormData,
): Promise<ResultadoGeminiImagenGenerada> {
  try {
    await requireAdminActor();
    const apiKey = resolverApiKeyGemini(formData);
    if (!apiKey) {
      return {
        ok: false,
        error:
          "Falta la clave de API. Configurá GEMINI_API_KEY en el servidor o pegá la clave en el campo del formulario.",
      };
    }

    const prompt = String(formData.get("prompt") ?? "").trim();
    if (!prompt) {
      return { ok: false, error: "El prompt no puede estar vacío." };
    }

    const imagen = formData.get("imagen");
    if (!(imagen instanceof File) || imagen.size === 0) {
      return { ok: false, error: "Subí una imagen de referencia del producto." };
    }

    const aspectRatio = String(formData.get("aspect_ratio") ?? "1:1").trim() || "1:1";
    const imageSize = String(formData.get("image_size") ?? "2K").trim() || "2K";

    const buf = Buffer.from(await imagen.arrayBuffer());
    const base64 = buf.toString("base64");
    const mimeType = mimeDesdeArchivoGemini(imagen);

    const r = await generarImagenGemini31FlashDesdeReferencia({
      apiKey,
      prompt,
      imagen: { base64, mimeType },
      aspectRatio,
      imageSize,
    });

    return {
      ok: true,
      imagen_base64: r.base64,
      mime_type: r.mimeType,
      mensaje_texto: r.textoModelo,
    };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido.";
    return { ok: false, error: mensaje };
  }
}
