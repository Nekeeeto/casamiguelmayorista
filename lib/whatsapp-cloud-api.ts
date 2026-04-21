import { leerConfigWhatsapp, type WhatsappConfigResuelto } from "@/lib/whatsapp-config";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type WhatsappTemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  text?: string;
  example?: {
    header_text?: string[];
    header_handle?: string[];
    body_text?: string[][];
  };
  buttons?: unknown[];
};

export type WhatsappTemplate = {
  name: string;
  language: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: WhatsappTemplateComponent[];
  id?: string;
};

export type WhatsappPhoneInfo = {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
};

export type WhatsappSendComponent = {
  type: "header" | "body" | "button";
  parameters?: WhatsappSendParameter[];
  sub_type?: "url" | "quick_reply";
  index?: string;
};

export type WhatsappSendParameter =
  | { type: "text"; text: string; parameter_name?: string }
  | { type: "currency"; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: "date_time"; date_time: { fallback_value: string } }
  | { type: "image"; image: { link: string } }
  | { type: "video"; video: { link: string } }
  | { type: "document"; document: { link: string; filename?: string } };

export type WhatsappSendResult = {
  messaging_product: "whatsapp";
  contacts: { input: string; wa_id: string }[];
  messages: { id: string; message_status?: string }[];
};

type GraphError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    error_data?: { details?: string };
  };
};

export class WhatsappCloudApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly subcode: number | null;
  constructor(message: string, status: number, code: number | null, subcode: number | null) {
    super(message);
    this.name = "WhatsappCloudApiError";
    this.status = status;
    this.code = code;
    this.subcode = subcode;
  }
}

async function parseGraphResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const err = (parsed as GraphError)?.error;
    const mensaje =
      err?.message ??
      err?.error_data?.details ??
      (typeof parsed === "string" ? parsed : `HTTP ${response.status}`);
    throw new WhatsappCloudApiError(
      mensaje,
      response.status,
      typeof err?.code === "number" ? err.code : null,
      typeof err?.error_subcode === "number" ? err.error_subcode : null,
    );
  }
  return (parsed as T) ?? (null as T);
}

function assertConfig(config: WhatsappConfigResuelto): {
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
} {
  const { phone_number_id, access_token, waba_id } = config.valores;
  if (!phone_number_id) throw new Error("Falta WHATSAPP_PHONE_NUMBER_ID.");
  if (!access_token) throw new Error("Falta WHATSAPP_ACCESS_TOKEN.");
  if (!waba_id) throw new Error("Falta WHATSAPP_BUSINESS_ACCOUNT_ID.");
  return { phoneNumberId: phone_number_id, accessToken: access_token, wabaId: waba_id };
}

async function fetchGraph<T>(
  path: string,
  accessToken: string,
  init?: RequestInit & { body?: BodyInit | null },
): Promise<T> {
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  return parseGraphResponse<T>(response);
}

/** GET /{phone-number-id} — info del número conectado (incluye display_phone_number). */
export async function getPhoneNumberInfo(configOverride?: WhatsappConfigResuelto): Promise<WhatsappPhoneInfo> {
  const config = configOverride ?? (await leerConfigWhatsapp());
  const { phoneNumberId, accessToken } = assertConfig(config);
  return fetchGraph<WhatsappPhoneInfo>(
    `/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier`,
    accessToken,
  );
}

/** GET /{waba-id}/message_templates — lista plantillas (paginada). */
export async function listApprovedTemplates(
  configOverride?: WhatsappConfigResuelto,
): Promise<WhatsappTemplate[]> {
  const config = configOverride ?? (await leerConfigWhatsapp());
  const { wabaId, accessToken } = assertConfig(config);
  const todas: WhatsappTemplate[] = [];
  let next: string | null = `/${wabaId}/message_templates?limit=200&fields=name,language,status,category,components,id`;
  while (next) {
    const resp: { data: WhatsappTemplate[]; paging?: { next?: string } } = await fetchGraph(
      next.startsWith("http") ? next.replace(GRAPH_BASE, "") : next,
      accessToken,
    );
    todas.push(...(resp.data ?? []));
    next = resp.paging?.next ?? null;
    if (resp.paging?.next && resp.paging.next.startsWith("http")) {
      next = resp.paging.next.replace(GRAPH_BASE, "");
    }
  }
  return todas;
}

/** Primera página de templates (sin paginar todo el WABA) — útil para dashboard. */
export async function listMessageTemplatesPreview(
  limit: number,
  configOverride?: WhatsappConfigResuelto,
): Promise<WhatsappTemplate[]> {
  const config = configOverride ?? (await leerConfigWhatsapp());
  const { wabaId, accessToken } = assertConfig(config);
  const cap = Math.min(Math.max(limit, 1), 200);
  const resp = await fetchGraph<{ data: WhatsappTemplate[] }>(
    `/${wabaId}/message_templates?limit=${cap}&fields=name,language,status,category,id`,
    accessToken,
  );
  return resp.data ?? [];
}

export type PayloadCrearPlantilla = {
  name: string;
  language: string;
  category: WhatsappTemplate["category"];
  components: WhatsappTemplateComponent[];
};

export type ResultadoCrearPlantilla = {
  id: string;
  status?: string;
  category?: string;
};

/** POST /{waba-id}/message_templates — alta en Meta (queda en revisión hasta aprobación). */
export async function createMessageTemplate(
  payload: PayloadCrearPlantilla,
  configOverride?: WhatsappConfigResuelto,
): Promise<ResultadoCrearPlantilla> {
  const config = configOverride ?? (await leerConfigWhatsapp());
  const { wabaId, accessToken } = assertConfig(config);
  return fetchGraph<ResultadoCrearPlantilla>(`/${wabaId}/message_templates`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      language: payload.language,
      category: payload.category,
      components: payload.components,
    }),
  });
}

/** DELETE /{template-id} — borra plantilla en Meta (id devuelto al listar). */
export async function deleteMessageTemplate(
  templateId: string,
  configOverride?: WhatsappConfigResuelto,
): Promise<void> {
  const config = configOverride ?? (await leerConfigWhatsapp());
  const { accessToken } = assertConfig(config);
  await fetchGraph<unknown>(`/${templateId}`, accessToken, {
    method: "DELETE",
  });
}

/** POST /{phone-number-id}/messages — texto libre (solo dentro de la ventana de 24hs). */
export async function sendTextMessage(
  to: string,
  text: string,
  configOverride?: WhatsappConfigResuelto,
): Promise<WhatsappSendResult> {
  const config = configOverride ?? (await leerConfigWhatsapp());
  const { phoneNumberId, accessToken } = assertConfig(config);
  return fetchGraph<WhatsappSendResult>(`/${phoneNumberId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });
}

/** POST /{phone-number-id}/messages — plantilla aprobada. */
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  language: string,
  components: WhatsappSendComponent[] | null,
  configOverride?: WhatsappConfigResuelto,
): Promise<WhatsappSendResult> {
  const config = configOverride ?? (await leerConfigWhatsapp());
  const { phoneNumberId, accessToken } = assertConfig(config);
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
    },
  };
  if (components && components.length > 0) {
    (payload.template as Record<string, unknown>).components = components;
  }
  return fetchGraph<WhatsappSendResult>(`/${phoneNumberId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /{phone-number-id}/messages — multimedia (imagen/video/doc por link). */
export async function sendMediaMessage(
  to: string,
  tipo: "image" | "video" | "document",
  link: string,
  caption: string | null,
  configOverride?: WhatsappConfigResuelto,
): Promise<WhatsappSendResult> {
  const config = configOverride ?? (await leerConfigWhatsapp());
  const { phoneNumberId, accessToken } = assertConfig(config);
  const media: Record<string, unknown> = { link };
  if (caption) media.caption = caption;
  return fetchGraph<WhatsappSendResult>(`/${phoneNumberId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: tipo,
      [tipo]: media,
    }),
  });
}

/** POST /{phone-number-id}/messages — marcar mensaje entrante como leído. */
export async function markMessageAsRead(
  waMessageId: string,
  configOverride?: WhatsappConfigResuelto,
): Promise<void> {
  const config = configOverride ?? (await leerConfigWhatsapp());
  const { phoneNumberId, accessToken } = assertConfig(config);
  await fetchGraph(`/${phoneNumberId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: waMessageId,
    }),
  });
}
