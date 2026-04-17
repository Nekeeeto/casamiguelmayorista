import { NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { leerConfigWhatsapp } from "@/lib/whatsapp-config";
import {
  KEYWORDS_OPT_IN_DEFAULT,
  KEYWORDS_OPT_OUT_DEFAULT,
  detectarKeywordOptOut,
  marcarOptIn,
  marcarOptOut,
  setsDesdeCsv,
} from "@/lib/whatsapp-optout";
import { enviarConfirmacionKeyword } from "@/lib/whatsapp-system-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MetaMensaje = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  video?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
};

type MetaStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string; message?: string }[];
};

type MetaPayload = {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: MetaMensaje[];
        statuses?: MetaStatus[];
      };
      field?: string;
    }[];
  }[];
};

function verificarFirma(rawBody: string, signature: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appSecret) return true;
  if (!signature?.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const entregado = signature.slice("sha256=".length);
  try {
    const a = Buffer.from(esperado, "hex");
    const b = Buffer.from(entregado, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && challenge) {
    const envToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";
    if (envToken && token === envToken) {
      return new NextResponse(challenge, { status: 200 });
    }
    try {
      const config = await leerConfigWhatsapp();
      const dbToken = config.valores.webhook_verify_token?.trim() ?? "";
      if (dbToken && token === dbToken) {
        return new NextResponse(challenge, { status: 200 });
      }
    } catch {
      // Supabase caído o tabla sin migrar: si ya validó arriba con env, no llegamos acá con match
    }
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verificarFirma(rawBody, signature)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let payload: MetaPayload;
  try {
    payload = JSON.parse(rawBody) as MetaPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  after(async () => {
    try {
      await procesarPayload(payload);
    } catch (error) {
      console.error("[whatsapp webhook] error async:", error);
    }
  });

  return NextResponse.json({ ok: true });
}

async function procesarPayload(payload: MetaPayload) {
  const supabase = getSupabaseAdmin();
  const waConfig = await leerConfigWhatsapp().catch(() => null);

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const toPhone = value.metadata?.display_phone_number ?? waConfig?.valores.phone_number_id ?? "";

      for (const status of value.statuses ?? []) {
        const { error } = await supabase
          .from("whatsapp_messages")
          .update({
            status: status.status,
            error: status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? null,
          })
          .eq("wa_message_id", status.id);
        if (error) {
          console.error("[whatsapp webhook] update status:", error.message);
        }
      }

      for (const mensaje of value.messages ?? []) {
        const body = mensaje.text?.body ?? mensaje.image?.caption ?? mensaje.video?.caption ?? mensaje.document?.caption ?? "";
        const mediaType =
          mensaje.type === "image"
            ? "image"
            : mensaje.type === "video"
              ? "video"
              : mensaje.type === "audio"
                ? "audio"
                : mensaje.type === "document"
                  ? "document"
                  : null;
        const recibidoAt = mensaje.timestamp ? new Date(Number(mensaje.timestamp) * 1000).toISOString() : new Date().toISOString();

        await supabase.from("whatsapp_messages").upsert(
          {
            wa_message_id: mensaje.id,
            direction: "in",
            from_phone: mensaje.from,
            to_phone: toPhone,
            body,
            media_type: mediaType,
            media_url: null,
            status: "received",
            received_at: recibidoAt,
            payload: mensaje as unknown as Record<string, unknown>,
          },
          { onConflict: "wa_message_id" },
        );

        await supabase
          .from("whatsapp_contacts")
          .update({ ultimo_mensaje: recibidoAt })
          .eq("telefono", mensaje.from);

        if (mensaje.type === "text" && mensaje.text?.body) {
          const sets = waConfig
            ? setsDesdeCsv(waConfig.automations.keywords_opt_out, waConfig.automations.keywords_opt_in)
            : setsDesdeCsv(KEYWORDS_OPT_OUT_DEFAULT, KEYWORDS_OPT_IN_DEFAULT);
          const intencion = detectarKeywordOptOut(mensaje.text.body, sets);
          if (intencion === "opt_out") {
            try {
              await marcarOptOut(mensaje.from);
              if (waConfig) {
                await enviarConfirmacionKeyword(mensaje.from, "opt_out_confirmacion", waConfig).catch((err) => {
                  console.error("[whatsapp webhook] auto opt-out reply:", err);
                });
              }
            } catch (error) {
              console.error("[whatsapp webhook] opt_out error:", error);
            }
          } else if (intencion === "opt_in") {
            try {
              await marcarOptIn(mensaje.from);
              if (waConfig) {
                await enviarConfirmacionKeyword(mensaje.from, "opt_in_confirmacion", waConfig).catch((err) => {
                  console.error("[whatsapp webhook] auto opt-in reply:", err);
                });
              }
            } catch (error) {
              console.error("[whatsapp webhook] opt_in error:", error);
            }
          } else if (waConfig?.automations.greeting_enabled && waConfig) {
            try {
              const { count } = await supabase
                .from("whatsapp_messages")
                .select("id", { count: "exact", head: true })
                .eq("from_phone", mensaje.from)
                .eq("direction", "in");
              if ((count ?? 0) === 1) {
                await enviarConfirmacionKeyword(mensaje.from, "greeting_auto", waConfig).catch((err) => {
                  console.error("[whatsapp webhook] greeting reply:", err);
                });
              }
            } catch (error) {
              console.error("[whatsapp webhook] greeting error:", error);
            }
          }
        }
      }
    }
  }
}
