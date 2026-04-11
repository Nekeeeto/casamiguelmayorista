/** Cliente mínimo REST para Gemini 3.1 Flash Image (Nano Banana 2). */

const MODEL = "gemini-3.1-flash-image-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type GeminiGenerarDesdeReferenciaArgs = {
  apiKey: string;
  prompt: string;
  imagen: { base64: string; mimeType: string };
  aspectRatio: string;
  imageSize: string;
};

export type GeminiGenerarResultado = {
  base64: string;
  mimeType: string;
  textoModelo?: string;
};

function extraerParteImagen(part: Record<string, unknown>): { mime: string; data: string } | null {
  const inline = (part.inlineData ?? part.inline_data) as
    | { mimeType?: string; mime_type?: string; data?: string }
    | undefined;
  if (inline?.data && typeof inline.data === "string") {
    const mime = String(inline.mimeType ?? inline.mime_type ?? "image/png").toLowerCase();
    return { mime, data: inline.data };
  }
  return null;
}

export async function generarImagenGemini31FlashDesdeReferencia(
  args: GeminiGenerarDesdeReferenciaArgs,
): Promise<GeminiGenerarResultado> {
  const parts: Record<string, unknown>[] = [
    {
      inline_data: {
        mime_type: args.imagen.mimeType,
        data: args.imagen.base64,
      },
    },
    { text: args.prompt },
  ];

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: args.aspectRatio,
        imageSize: args.imageSize,
      },
    },
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": args.apiKey,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    const msg = typeof err?.message === "string" && err.message.trim() ? err.message : `HTTP ${res.status}`;
    throw new Error(`Gemini: ${msg}`);
  }

  const candidates = json.candidates as
    | Array<{ content?: { parts?: Array<Record<string, unknown>> }; finishReason?: string }>
    | undefined;
  const first = candidates?.[0];
  const reason = first?.finishReason;
  if (
    reason === "SAFETY" ||
    reason === "BLOCKED" ||
    reason === "PROHIBITED_CONTENT" ||
    reason === "IMAGE_SAFETY"
  ) {
    throw new Error("La generación fue bloqueada por las políticas de seguridad de Google. Probá otra imagen o prompt.");
  }
  const rawParts = first?.content?.parts;
  if (!rawParts?.length) {
    throw new Error("La API no devolvió contenido. Revisá la clave y el modelo en tu proyecto de Google AI.");
  }

  let textoModelo = "";
  let imagenOut: { mime: string; data: string } | null = null;

  for (const p of rawParts) {
    if (typeof p.text === "string" && p.text.trim()) {
      textoModelo = textoModelo ? `${textoModelo}\n${p.text}` : p.text;
    }
    const img = extraerParteImagen(p);
    if (img) {
      imagenOut = img;
      break;
    }
  }

  if (!imagenOut) {
    const recorte = textoModelo.trim().slice(0, 400);
    throw new Error(
      recorte
        ? `La IA no devolvió imagen. Texto: ${recorte}${textoModelo.length > 400 ? "…" : ""}`
        : "La respuesta no incluyó imagen. Probá de nuevo o ajustá el prompt.",
    );
  }

  return {
    base64: imagenOut.data,
    mimeType: imagenOut.mime,
    textoModelo: textoModelo.trim() || undefined,
  };
}
