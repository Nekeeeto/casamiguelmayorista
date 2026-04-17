import { getSupabaseAdmin } from "@/lib/supabase-admin";

import { KEYWORDS_OPT_IN_DEFAULT, KEYWORDS_OPT_OUT_DEFAULT } from "@/lib/whatsapp-optout";

export type WhatsappConfigValores = {
  phone_number_id: string;
  access_token: string;
  webhook_verify_token: string;
  waba_id: string;
};

export type WhatsappAutomationsConfig = {
  keywords_opt_out: string;
  keywords_opt_in: string;
  greeting_enabled: boolean;
  delay_enabled: boolean;
};

export type WhatsappPricingMap = {
  marketing: number;
  utility: number;
  authentication: number;
};

export type WhatsappConfigFuente = "db" | "env" | "mixto" | "vacio";

export type WhatsappConfigResuelto = {
  valores: WhatsappConfigValores;
  pricing: WhatsappPricingMap;
  fuente: WhatsappConfigFuente;
  updatedAt: string | null;
  automations: WhatsappAutomationsConfig;
};

const PRICING_DEFAULT: WhatsappPricingMap = {
  marketing: 0.055,
  utility: 0.0137,
  authentication: 0.0312,
};

type FilaConfig = {
  id: number;
  phone_number_id: string | null;
  access_token: string | null;
  webhook_verify_token: string | null;
  waba_id: string | null;
  pricing: Partial<WhatsappPricingMap> | null;
  updated_at: string;
  keywords_opt_out: string | null;
  keywords_opt_in: string | null;
  automation_greeting_enabled: boolean | null;
  automation_delay_enabled: boolean | null;
};

function valorEnv(nombre: string): string {
  const v = process.env[nombre];
  return typeof v === "string" ? v.trim() : "";
}

function fuenteDe(valoresDb: Partial<WhatsappConfigValores>, valoresEnv: WhatsappConfigValores): WhatsappConfigFuente {
  const campos: (keyof WhatsappConfigValores)[] = [
    "phone_number_id",
    "access_token",
    "webhook_verify_token",
    "waba_id",
  ];
  let tieneDb = false;
  let tieneEnv = false;
  for (const campo of campos) {
    if (valoresDb[campo]) tieneDb = true;
    else if (valoresEnv[campo]) tieneEnv = true;
  }
  if (tieneDb && tieneEnv) return "mixto";
  if (tieneDb) return "db";
  if (tieneEnv) return "env";
  return "vacio";
}

export async function leerConfigWhatsapp(): Promise<WhatsappConfigResuelto> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_config")
    .select(
      "id, phone_number_id, access_token, webhook_verify_token, waba_id, pricing, updated_at, keywords_opt_out, keywords_opt_in, automation_greeting_enabled, automation_delay_enabled",
    )
    .eq("id", 1)
    .maybeSingle<FilaConfig>();

  if (error) throw new Error(`No se pudo leer whatsapp_config: ${error.message}`);

  const envValores: WhatsappConfigValores = {
    phone_number_id: valorEnv("WHATSAPP_PHONE_NUMBER_ID"),
    access_token: valorEnv("WHATSAPP_ACCESS_TOKEN"),
    webhook_verify_token: valorEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    waba_id: valorEnv("WHATSAPP_BUSINESS_ACCOUNT_ID"),
  };

  const dbValores: Partial<WhatsappConfigValores> = {
    phone_number_id: data?.phone_number_id ?? undefined,
    access_token: data?.access_token ?? undefined,
    webhook_verify_token: data?.webhook_verify_token ?? undefined,
    waba_id: data?.waba_id ?? undefined,
  };

  const valores: WhatsappConfigValores = {
    phone_number_id: dbValores.phone_number_id || envValores.phone_number_id,
    access_token: dbValores.access_token || envValores.access_token,
    webhook_verify_token: dbValores.webhook_verify_token || envValores.webhook_verify_token,
    waba_id: dbValores.waba_id || envValores.waba_id,
  };

  const pricing: WhatsappPricingMap = {
    marketing: Number(data?.pricing?.marketing ?? PRICING_DEFAULT.marketing),
    utility: Number(data?.pricing?.utility ?? PRICING_DEFAULT.utility),
    authentication: Number(data?.pricing?.authentication ?? PRICING_DEFAULT.authentication),
  };

  const automations: WhatsappAutomationsConfig = {
    keywords_opt_out: (data?.keywords_opt_out ?? "").trim() || KEYWORDS_OPT_OUT_DEFAULT,
    keywords_opt_in: (data?.keywords_opt_in ?? "").trim() || KEYWORDS_OPT_IN_DEFAULT,
    greeting_enabled: data?.automation_greeting_enabled ?? true,
    delay_enabled: data?.automation_delay_enabled ?? false,
  };

  return {
    valores,
    pricing,
    fuente: fuenteDe(dbValores, envValores),
    updatedAt: data?.updated_at ?? null,
    automations,
  };
}

export type WhatsappConfigPartial = Partial<WhatsappConfigValores> & {
  pricing?: Partial<WhatsappPricingMap>;
  keywords_opt_out?: string;
  keywords_opt_in?: string;
  automation_greeting_enabled?: boolean;
  automation_delay_enabled?: boolean;
};

export async function guardarConfigWhatsapp(partial: WhatsappConfigPartial): Promise<void> {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (partial.phone_number_id !== undefined) patch.phone_number_id = partial.phone_number_id || null;
  if (partial.access_token !== undefined) patch.access_token = partial.access_token || null;
  if (partial.webhook_verify_token !== undefined) patch.webhook_verify_token = partial.webhook_verify_token || null;
  if (partial.waba_id !== undefined) patch.waba_id = partial.waba_id || null;
  if (partial.pricing) {
    const actual = await leerConfigWhatsapp();
    patch.pricing = { ...actual.pricing, ...partial.pricing };
  }
  if (partial.keywords_opt_out !== undefined) {
    patch.keywords_opt_out = partial.keywords_opt_out?.trim() || KEYWORDS_OPT_OUT_DEFAULT;
  }
  if (partial.keywords_opt_in !== undefined) {
    patch.keywords_opt_in = partial.keywords_opt_in?.trim() || KEYWORDS_OPT_IN_DEFAULT;
  }
  if (partial.automation_greeting_enabled !== undefined) {
    patch.automation_greeting_enabled = partial.automation_greeting_enabled;
  }
  if (partial.automation_delay_enabled !== undefined) {
    patch.automation_delay_enabled = partial.automation_delay_enabled;
  }
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("whatsapp_config").update(patch).eq("id", 1);
  if (error) throw new Error(`No se pudo guardar whatsapp_config: ${error.message}`);
}

export type ResultadoPruebaConexion =
  | { ok: true; display_phone_number: string; verified_name: string; quality_rating: string | null; messaging_limit_tier: string | null }
  | { ok: false; error: string; code: number | null };

export async function probarConexionWhatsapp(): Promise<ResultadoPruebaConexion> {
  const { getPhoneNumberInfo, WhatsappCloudApiError } = await import("@/lib/whatsapp-cloud-api");
  try {
    const info = await getPhoneNumberInfo();
    return {
      ok: true,
      display_phone_number: info.display_phone_number,
      verified_name: info.verified_name,
      quality_rating: info.quality_rating ?? null,
      messaging_limit_tier: info.messaging_limit_tier ?? null,
    };
  } catch (error) {
    if (error instanceof WhatsappCloudApiError) {
      return { ok: false, error: error.message, code: error.code };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error inesperado.",
      code: null,
    };
  }
}
