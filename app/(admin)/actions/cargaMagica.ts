"use server";

import { revalidatePath } from "next/cache";

import { PROMPT_SISTEMA_CARGA_MAGICA } from "@/lib/carga-magica-sistema-prompt";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseServidor } from "@/lib/supabase-servidor";
import {
  createWooProduct,
  fetchAllWooProductCategories,
  fetchWooDraftProducts,
  getWooBaseUrl,
  updateWooProductPartial,
  type WooCategoriaArbol,
} from "@/lib/woo";

export type FichaProductoCargaMagica = {
  sku: string;
  titulo_seo: string;
  slug: string;
  desc_corta_html: string;
  desc_larga_html: string;
  prompt_foto_2: string;
  /** IDs de categorías Woo válidos (solo los que existan en el catálogo enviado a la IA). */
  woo_category_ids?: number[];
  /** La IA no pudo mapear a ninguna categoría del catálogo. */
  categoria_sin_coincidencia?: boolean;
  /** Nota de la IA sobre la elección o la falta de match. */
  categoria_mensaje_ia?: string;
};

export type UsoApisCargaMagica = {
  photoroom_llamadas: number;
  anthropic_input_tokens: number;
  anthropic_output_tokens: number;
};

export type ResultadoExtraerFichaProducto =
  | {
      ok: true;
      pasos: string[];
      ficha: FichaProductoCargaMagica;
      uso_apis: UsoApisCargaMagica;
      categorias_aplicadas?: string[];
      categoria_advertencia?: string | null;
    }
  | { ok: false; pasos: string[]; error: string };

export type ResultadoCrearWooDesdeFicha =
  | {
      ok: true;
      pasos: string[];
      modo: "draft" | "publish";
      woo_product_id: number;
      titulo_seo: string;
      prompt_foto_2: string;
      url_revision_woo: string;
      categorias_aplicadas?: string[];
      categoria_advertencia?: string | null;
    }
  | { ok: false; pasos: string[]; error: string };

export type ResultadoProcesarProductoPorScreenshot =
  | {
      ok: true;
      pasos: string[];
      modo: "draft" | "publish";
      woo_product_id: number;
      titulo_seo: string;
      prompt_foto_2: string;
      url_revision_woo: string;
      uso_apis: UsoApisCargaMagica;
      categorias_aplicadas?: string[];
      categoria_advertencia?: string | null;
    }
  | { ok: false; pasos: string[]; error: string };

export type BorradorWooListadoItem = {
  id: number;
  name: string;
  sku: string;
  slug: string;
  date_created?: string;
  desc_corta_resumen: string;
  categorias: string;
  url_editar: string;
};

export type ResultadoListarBorradoresWoo =
  | { ok: true; items: BorradorWooListadoItem[] }
  | { ok: false; error: string };

export type ResultadoPublicarBorradorWoo = { ok: true } | { ok: false; error: string };

function textoPlanoResumido(html: string, max: number): string {
  const sinTags = String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!sinTags) return "—";
  if (sinTags.length <= max) return sinTags;
  return `${sinTags.slice(0, Math.max(0, max - 1))}…`;
}

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

function mimeDesdeArchivo(archivo: File): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const t = archivo.type?.toLowerCase() ?? "";
  if (t.includes("jpeg") || t.includes("jpg")) return "image/jpeg";
  if (t.includes("png")) return "image/png";
  if (t.includes("webp")) return "image/webp";
  if (t.includes("gif")) return "image/gif";
  return "image/png";
}

function rutaCategoriaDesdeId(id: number, categorias: WooCategoriaArbol[]): string {
  const byId = new Map(categorias.map((c) => [c.id, c]));
  const nombres: string[] = [];
  const visitados = new Set<number>();
  let cur: WooCategoriaArbol | undefined = byId.get(id);
  while (cur && !visitados.has(cur.id)) {
    visitados.add(cur.id);
    nombres.unshift(cur.name);
    cur = cur.parent ? byId.get(cur.parent) : undefined;
  }
  return nombres.join(" > ");
}

const MAX_LINEAS_CATALOGO_CATEGORIAS = 2200;

function tablaCategoriasParaPrompt(categorias: WooCategoriaArbol[]): { texto: string; truncado: boolean } {
  const ordenadas = [...categorias].sort((a, b) =>
    a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
  );
  const lineas = ordenadas.map(
    (c) => `${c.id}\t${c.parent}\t${String(c.name).replace(/\s+/g, " ").trim()}`,
  );
  const truncado = lineas.length > MAX_LINEAS_CATALOGO_CATEGORIAS;
  const cuerpo = truncado
    ? lineas.slice(0, MAX_LINEAS_CATALOGO_CATEGORIAS).join("\n")
    : lineas.join("\n");
  const texto = `id_categoria\tid_padre\tnombre\n${cuerpo}${truncado ? "\n…(listado truncado por tamaño; priorizá las categorías más obvias con lo visible)" : ""}`;
  return { texto, truncado };
}

function normalizarIdsCategoriasEnFicha(
  rawIds: unknown,
  permitidos: Set<number>,
): number[] {
  if (!Array.isArray(rawIds)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const x of rawIds) {
    const id = Math.floor(Number(x));
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!permitidos.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 5) break;
  }
  return out;
}

function extraerJsonObjeto(
  texto: string,
  opts?: { idsCategoriasPermitidos?: Set<number> },
): FichaProductoCargaMagica {
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin === -1 || fin <= inicio) {
    throw new Error("La IA no devolvió un JSON válido.");
  }
  const json = JSON.parse(limpio.slice(inicio, fin + 1)) as Record<string, unknown>;
  const sku = String(json.sku ?? "").trim();
  const titulo_seo = String(json.titulo_seo ?? "").trim();
  const slug = String(json.slug ?? "").trim();
  const desc_corta_html = String(json.desc_corta_html ?? "").trim();
  const desc_larga_html = String(json.desc_larga_html ?? "").trim();
  const prompt_foto_2 = String(json.prompt_foto_2 ?? "").trim();
  if (!titulo_seo || !slug || !desc_corta_html || !desc_larga_html) {
    throw new Error("JSON de IA incompleto (faltan título, slug o descripciones).");
  }

  const permitidos = opts?.idsCategoriasPermitidos;
  const hayCatalogo = Boolean(permitidos && permitidos.size > 0);
  const woo_category_ids = hayCatalogo
    ? normalizarIdsCategoriasEnFicha(json.woo_category_ids, permitidos!)
    : [];

  const categoria_sin_coincidencia = hayCatalogo
    ? typeof json.categoria_sin_coincidencia === "boolean"
      ? json.categoria_sin_coincidencia
      : woo_category_ids.length === 0
    : false;

  let categoria_mensaje_ia = String(json.categoria_mensaje_ia ?? "").trim();
  if (categoria_mensaje_ia.length > 800) {
    categoria_mensaje_ia = `${categoria_mensaje_ia.slice(0, 797)}…`;
  }

  const ficha: FichaProductoCargaMagica = {
    sku,
    titulo_seo,
    slug,
    desc_corta_html,
    desc_larga_html,
    prompt_foto_2,
  };
  if (hayCatalogo) {
    ficha.categoria_sin_coincidencia = categoria_sin_coincidencia;
    if (categoria_mensaje_ia) ficha.categoria_mensaje_ia = categoria_mensaje_ia;
    if (woo_category_ids.length > 0) ficha.woo_category_ids = woo_category_ids;
  }
  return ficha;
}

async function archivoImagenADataUrl(archivo: File): Promise<string> {
  const buf = Buffer.from(await archivo.arrayBuffer());
  const b64 = buf.toString("base64");
  const mime = mimeDesdeArchivo(archivo);
  return `data:${mime};base64,${b64}`;
}

/** Cupo vencido, rate limit u otros rechazos recuperables sin tumbar el pipeline. */
function esErrorCupoOPoliticaPhotoroom(mensaje: string) {
  const m = mensaje.toLowerCase();
  return (
    /\((402|403|429)\)/.test(mensaje) ||
    m.includes("exhausted") ||
    m.includes("quota") ||
    m.includes("update your plan") ||
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("payment required")
  );
}

async function llamarPhotoroomSegment(
  apiKey: string,
  archivo: File,
  pasos: string[],
): Promise<{ dataUrlPng: string }> {
  pasos.push("1. Leyendo foto cruda y enviando a Photoroom (fondo blanco)…");
  const formData = new FormData();
  formData.append("image_file", archivo, archivo.name || "producto.jpg");
  formData.append("bg_color", "FFFFFF");

  const respuesta = await fetch("https://sdk.photoroom.com/v1/segment", {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: formData,
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(
      `Photoroom rechazó la solicitud (${respuesta.status}). ${detalle.slice(0, 200)}`.trim(),
    );
  }

  const resultado = Buffer.from(await respuesta.arrayBuffer());
  const base64 = resultado.toString("base64");
  pasos.push("2. Photoroom OK — imagen principal lista.");
  return { dataUrlPng: `data:image/png;base64,${base64}` };
}

function categoriasResumenSinPasos(
  contenido: FichaProductoCargaMagica,
  categorias: WooCategoriaArbol[],
): { aplicadas: string[]; advertencia: string | null } {
  if (!categorias.length) return { aplicadas: [], advertencia: null };
  if (contenido.categoria_sin_coincidencia) {
    return {
      aplicadas: [],
      advertencia:
        contenido.categoria_mensaje_ia?.trim() ||
        "La IA no encontró una categoría adecuada en el catálogo actual.",
    };
  }
  const ids = contenido.woo_category_ids ?? [];
  if (!ids.length) {
    return {
      aplicadas: [],
      advertencia: contenido.categoria_mensaje_ia?.trim() || "Sin categorías asignadas.",
    };
  }
  return {
    aplicadas: ids.map((id) => rutaCategoriaDesdeId(id, categorias)),
    advertencia: null,
  };
}

function pasosTrasCategoriasIa(
  contenido: FichaProductoCargaMagica,
  categorias: WooCategoriaArbol[],
  pasos: string[],
): { aplicadas: string[]; advertencia: string | null } {
  const r = categoriasResumenSinPasos(contenido, categorias);
  if (!categorias.length) {
    pasos.push("5. Categorías: no se pudo obtener el catálogo Woo — el producto se crea sin categorías.");
    return r;
  }
  if (r.aplicadas.length === 0) {
    if (contenido.categoria_sin_coincidencia) {
      pasos.push(`5. Categorías: sin coincidencia — ${r.advertencia ?? ""}`);
    } else {
      pasos.push(
        `5. Categorías: sin IDs válidos — ${r.advertencia ?? "Revisá el catálogo o el JSON de la IA."}`,
      );
    }
    return r;
  }
  pasos.push(`5. Categorías asignadas: ${r.aplicadas.join(" · ")}.`);
  if (contenido.categoria_mensaje_ia?.trim()) {
    pasos.push(`5b. Nota de la IA (categorías): ${contenido.categoria_mensaje_ia.trim()}`);
  }
  return r;
}

async function llamarAnthropicVision(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  screenshot: File;
  precioVenta: string;
  nombreBaseSku: string;
  pasos: string[];
  categoriasWoo: WooCategoriaArbol[];
}): Promise<{
  contenido: FichaProductoCargaMagica;
  input_tokens: number;
  output_tokens: number;
}> {
  const { apiKey, model, systemPrompt, screenshot, precioVenta, nombreBaseSku, pasos, categoriasWoo } = args;
  pasos.push("3. Leyendo screenshot y generando ficha con Claude (visión)…");

  const base64 = Buffer.from(await screenshot.arrayBuffer()).toString("base64");
  const mediaType = mimeDesdeArchivo(screenshot);

  const { texto: tablaCat, truncado } = tablaCategoriasParaPrompt(categoriasWoo);
  if (truncado) {
    pasos.push("3b. Catálogo de categorías grande: se envió un subconjunto a la IA.");
  }
  const idsPermitidos = new Set(categoriasWoo.map((c) => c.id));

  const instruccionUsuario = `Datos auxiliares para este producto (una sola captura de proveedor):
- Precio de venta en tienda (solo referencia, NO lo incluyas en las descripciones HTML): ${precioVenta}
- Nombre base o SKU sugerido por el operador (opcional, podés ignorar si la captura es clara): ${nombreBaseSku || "(no indicado)"}

Catálogo de categorías WooCommerce (usá SOLO ids de la primera columna; id_padre=0 es raíz):
${tablaCat}

Recordá: respondé únicamente con el objeto JSON con claves sku, titulo_seo, slug, desc_corta_html, desc_larga_html, prompt_foto_2, woo_category_ids, categoria_sin_coincidencia, categoria_mensaje_ia.`;

  const cuerpo = {
    model: model.trim() || "claude-sonnet-4-6",
    max_tokens: 8192,
    system: systemPrompt.trim(),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64,
            },
          },
          { type: "text", text: instruccionUsuario },
        ],
      },
    ],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(cuerpo),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Anthropic API error ${res.status}: ${errText.slice(0, 400)}`.trim(),
    );
  }

  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const input_tokens = Math.max(0, Number(data.usage?.input_tokens ?? 0));
  const output_tokens = Math.max(0, Number(data.usage?.output_tokens ?? 0));
  const bloques = data.content ?? [];
  const texto = bloques
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!texto) {
    throw new Error("Anthropic no devolvió texto.");
  }

  const parsed = extraerJsonObjeto(texto, { idsCategoriasPermitidos: idsPermitidos });
  pasos.push("4. Contenido SEO y JSON de ficha generados (incluye categorías sugeridas).");
  pasos.push(
    `4b. Uso Anthropic (tokens): entrada ${input_tokens.toLocaleString("es-UY")} · salida ${output_tokens.toLocaleString("es-UY")}.`,
  );
  pasosTrasCategoriasIa(parsed, categoriasWoo, pasos);
  return { contenido: parsed, input_tokens, output_tokens };
}

function parsearFlagsComunes(formData: FormData) {
  const photoroomKey = String(formData.get("photoroom_api_key") ?? "").trim();
  const anthropicKey = String(formData.get("anthropic_api_key") ?? "").trim();
  const omitirPhotoroomRaw = String(formData.get("omitir_photoroom") ?? "false").toLowerCase();
  const omitirPhotoroom =
    omitirPhotoroomRaw === "true" || omitirPhotoroomRaw === "1" || omitirPhotoroomRaw === "on";
  const promptCustom = String(formData.get("prompt_sistema_claude") ?? "").trim();
  const systemPrompt = promptCustom.length > 0 ? promptCustom : PROMPT_SISTEMA_CARGA_MAGICA;
  const model = String(formData.get("anthropic_model") ?? "claude-sonnet-4-6").trim();
  const nombreBaseSku = String(formData.get("nombre_base_sku") ?? "").trim();
  const precioVenta = String(formData.get("precio_venta") ?? "").trim();
  return {
    photoroomKey,
    anthropicKey,
    omitirPhotoroom,
    systemPrompt,
    model,
    nombreBaseSku,
    precioVenta,
  };
}

/** Solo Claude + screenshot → JSON ficha (sin Photoroom ni Woo). */
export async function extraerFichaProductoPorScreenshot(
  formData: FormData,
): Promise<ResultadoExtraerFichaProducto> {
  const pasos: string[] = ["0. Extracción de ficha (solo Claude)…"];
  try {
    await requireAdminActor();
    const { anthropicKey, systemPrompt, model, nombreBaseSku, precioVenta } =
      parsearFlagsComunes(formData);

    if (!anthropicKey) {
      return { ok: false, pasos, error: "Falta la clave de Anthropic." };
    }
    if (!precioVenta) {
      return { ok: false, pasos, error: "Indicá el precio de venta." };
    }
    const screenshot = formData.get("screenshot");
    if (!(screenshot instanceof File) || screenshot.size === 0) {
      return { ok: false, pasos, error: "Subí la screenshot para extraer datos." };
    }

    let categoriasWoo: WooCategoriaArbol[] = [];
    try {
      categoriasWoo = await fetchAllWooProductCategories();
      pasos.push(
        `1. Catálogo Woo: ${categoriasWoo.length} categorías cargadas para que la IA elija rutas válidas.`,
      );
    } catch {
      pasos.push("1. Catálogo Woo: no se pudo cargar — la ficha se genera sin asignación de categorías.");
    }

    const { contenido, input_tokens, output_tokens } = await llamarAnthropicVision({
      apiKey: anthropicKey,
      model,
      systemPrompt,
      screenshot,
      precioVenta,
      nombreBaseSku,
      pasos,
      categoriasWoo,
    });

    const catRes = categoriasResumenSinPasos(contenido, categoriasWoo);
    pasos.push("6. Extracción finalizada (sin WooCommerce).");
    return {
      ok: true,
      pasos,
      ficha: contenido,
      uso_apis: {
        photoroom_llamadas: 0,
        anthropic_input_tokens: input_tokens,
        anthropic_output_tokens: output_tokens,
      },
      categorias_aplicadas: catRes.aplicadas.length ? catRes.aplicadas : undefined,
      categoria_advertencia: !catRes.aplicadas.length ? catRes.advertencia ?? undefined : undefined,
    };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido.";
    pasos.push(`✖ Error: ${mensaje}`);
    return { ok: false, pasos, error: mensaje };
  }
}

/** Crea producto en Woo a partir de JSON ficha ya aprobado (sin nueva llamada a Claude). */
export async function crearProductoWooDesdeFicha(formData: FormData): Promise<ResultadoCrearWooDesdeFicha> {
  const pasos: string[] = ["0. Alta en WooCommerce desde ficha aprobada…"];
  try {
    await requireAdminActor();

    const aprobacionRaw = String(formData.get("aprobacion_manual") ?? "true").toLowerCase();
    const aprobacionRequerida = aprobacionRaw !== "false" && aprobacionRaw !== "0" && aprobacionRaw !== "off";
    const precioVenta = String(formData.get("precio_venta") ?? "").trim();
    const nombreBaseSku = String(formData.get("nombre_base_sku") ?? "").trim();
    const fichaJson = String(formData.get("ficha_json") ?? "").trim();

    if (!precioVenta) {
      return { ok: false, pasos, error: "Indicá el precio de venta." };
    }
    if (!fichaJson) {
      return { ok: false, pasos, error: "Falta el JSON de la ficha." };
    }

    let ficha: FichaProductoCargaMagica;
    try {
      ficha = JSON.parse(fichaJson) as FichaProductoCargaMagica;
    } catch {
      return { ok: false, pasos, error: "JSON de ficha inválido." };
    }
    if (!ficha.titulo_seo || !ficha.slug || !ficha.desc_corta_html || !ficha.desc_larga_html) {
      return { ok: false, pasos, error: "La ficha no tiene los campos mínimos (título, slug, descripciones)." };
    }

    const status = aprobacionRequerida ? "draft" : "publish";
    pasos.push(
      aprobacionRequerida
        ? "1. Creando producto como borrador…"
        : "1. Publicando producto…",
    );

    const precioNormalizado = precioVenta.replace(",", ".").trim();
    const skuFinal = (ficha.sku || nombreBaseSku || "").trim();

    const imagenPrincipal = formData.get("imagen_principal_woo");
    let images: Record<string, unknown>[] | undefined;
    if (imagenPrincipal instanceof File && imagenPrincipal.size > 0) {
      const dataUrl = await archivoImagenADataUrl(imagenPrincipal);
      images = [{ src: dataUrl, alt: ficha.titulo_seo, name: ficha.titulo_seo }];
      pasos.push("2. Imagen principal adjunta (manual).");
    } else {
      pasos.push("2. Sin imagen principal (podés subirla después en Woo).");
    }

    let categoriasWoo: WooCategoriaArbol[] = [];
    try {
      categoriasWoo = await fetchAllWooProductCategories();
    } catch {
      pasos.push("2b. Categorías: no se pudo cargar el catálogo Woo — se omiten en el alta.");
    }
    const permitidos = new Set(categoriasWoo.map((c) => c.id));
    const idsCategorias = normalizarIdsCategoriasEnFicha(ficha.woo_category_ids ?? [], permitidos);
    const fichaParaResumen: FichaProductoCargaMagica = {
      ...ficha,
      woo_category_ids: idsCategorias.length ? idsCategorias : undefined,
      categoria_sin_coincidencia:
        idsCategorias.length > 0 ? false : Boolean(ficha.categoria_sin_coincidencia),
    };
    if (categoriasWoo.length > 0) {
      const rCat = categoriasResumenSinPasos(fichaParaResumen, categoriasWoo);
      if (rCat.aplicadas.length > 0) {
        pasos.push(`2b. Categorías en el alta: ${rCat.aplicadas.join(" · ")}.`);
      } else if (rCat.advertencia) {
        pasos.push(`2b. Categorías: ${rCat.advertencia}`);
      } else {
        pasos.push("2b. Categorías: sin IDs válidos en la ficha para el catálogo actual.");
      }
    }

    const payload: Record<string, unknown> = {
      name: ficha.titulo_seo,
      type: "simple",
      status,
      slug: ficha.slug,
      sku: skuFinal || undefined,
      regular_price: precioNormalizado,
      short_description: ficha.desc_corta_html,
      description: ficha.desc_larga_html,
      catalog_visibility: "visible",
    };
    if (images) payload.images = images;
    if (idsCategorias.length > 0) {
      payload.categories = idsCategorias.map((id) => ({ id }));
    }

    const creado = await createWooProduct(payload);
    const wooId = Number(creado.id);
    if (!Number.isFinite(wooId) || wooId <= 0) {
      throw new Error("WooCommerce no devolvió un id de producto válido.");
    }

    const base = getWooBaseUrl();
    const urlRevisionWoo = `${base}/wp-admin/post.php?post=${wooId}&action=edit`;

    pasos.push("3. Producto creado en WooCommerce.");
    revalidatePath("/admin");
    revalidatePath("/admin/inventario");
    revalidatePath("/inventario");

    const catResFinal = categoriasWoo.length
      ? categoriasResumenSinPasos(fichaParaResumen, categoriasWoo)
      : { aplicadas: [] as string[], advertencia: null as string | null };

    return {
      ok: true,
      pasos,
      modo: aprobacionRequerida ? "draft" : "publish",
      woo_product_id: wooId,
      titulo_seo: ficha.titulo_seo,
      prompt_foto_2: ficha.prompt_foto_2,
      url_revision_woo: urlRevisionWoo,
      categorias_aplicadas: catResFinal.aplicadas.length ? catResFinal.aplicadas : undefined,
      categoria_advertencia: !catResFinal.aplicadas.length
        ? catResFinal.advertencia ?? undefined
        : undefined,
    };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido.";
    pasos.push(`✖ Error: ${mensaje}`);
    return { ok: false, pasos, error: mensaje };
  }
}

export async function procesarProductoPorScreenshot(
  formData: FormData,
): Promise<ResultadoProcesarProductoPorScreenshot> {
  const pasos: string[] = ["0. Iniciando pipeline Carga Mágica…"];

  try {
    await requireAdminActor();

    const {
      photoroomKey,
      anthropicKey,
      omitirPhotoroom,
      systemPrompt,
      model,
      nombreBaseSku,
      precioVenta,
    } = parsearFlagsComunes(formData);

    const aprobacionRaw = String(formData.get("aprobacion_manual") ?? "true").toLowerCase();
    const aprobacionRequerida = aprobacionRaw !== "false" && aprobacionRaw !== "0" && aprobacionRaw !== "off";

    const fotoCruda = formData.get("foto_cruda");
    const screenshot = formData.get("screenshot");
    const imagenPrincipalWoo = formData.get("imagen_principal_woo");

    if (!anthropicKey) {
      return { ok: false, pasos, error: "Falta la clave de Anthropic." };
    }
    if (!omitirPhotoroom && !photoroomKey) {
      return { ok: false, pasos, error: "Falta la clave de Photoroom (o activá Omitir Photoroom)." };
    }
    if (!precioVenta) {
      return { ok: false, pasos, error: "Indicá el precio de venta." };
    }
    if (!(screenshot instanceof File) || screenshot.size === 0) {
      return { ok: false, pasos, error: "Subí la screenshot para extraer datos." };
    }

    let dataUrlPrincipal: string | null = null;
    let photoroomLlamadas = 0;

    if (!omitirPhotoroom) {
      if (!(fotoCruda instanceof File) || fotoCruda.size === 0) {
        return {
          ok: false,
          pasos,
          error: "Subí la foto cruda para Photoroom (o activá Omitir Photoroom).",
        };
      }
      try {
        const pr = await llamarPhotoroomSegment(photoroomKey, fotoCruda as File, pasos);
        dataUrlPrincipal = pr.dataUrlPng;
        photoroomLlamadas = 1;
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : String(e);
        if (!esErrorCupoOPoliticaPhotoroom(mensaje)) {
          throw e;
        }
        pasos.push(
          "⚠ Photoroom rechazó la solicitud (cupo/plan o límite). Se omite el paso y se sigue con Claude → Woo.",
        );
        if (imagenPrincipalWoo instanceof File && imagenPrincipalWoo.size > 0) {
          dataUrlPrincipal = await archivoImagenADataUrl(imagenPrincipalWoo);
          pasos.push("2b. Imagen principal manual aplicada como respaldo.");
        } else {
          pasos.push("2b. Sin imagen manual: el producto se creará solo con textos hasta que subas fotos en Woo.");
        }
        photoroomLlamadas = 0;
      }
    } else {
      pasos.push("1. Photoroom omitido — usá imagen manual para Woo si la subís.");
      if (imagenPrincipalWoo instanceof File && imagenPrincipalWoo.size > 0) {
        dataUrlPrincipal = await archivoImagenADataUrl(imagenPrincipalWoo);
        pasos.push("2. Imagen principal manual lista para Woo.");
      } else {
        pasos.push("2. Sin imagen principal: el producto se creará solo con textos.");
      }
    }

    let categoriasWoo: WooCategoriaArbol[] = [];
    try {
      categoriasWoo = await fetchAllWooProductCategories();
      pasos.push(
        `2c. Catálogo Woo: ${categoriasWoo.length} categorías para asignación con IA.`,
      );
    } catch {
      pasos.push("2c. Catálogo Woo: no se pudo cargar — el producto se creará sin categorías.");
    }

    const { contenido, input_tokens, output_tokens } = await llamarAnthropicVision({
      apiKey: anthropicKey,
      model,
      systemPrompt,
      screenshot,
      precioVenta,
      nombreBaseSku,
      pasos,
      categoriasWoo,
    });

    const status = aprobacionRequerida ? "draft" : "publish";
    pasos.push(
      aprobacionRequerida
        ? "6. Creando producto en WooCommerce como borrador (aprobación manual activa)…"
        : "6. Publicando producto en WooCommerce (aprobación manual desactivada)…",
    );

    const precioNormalizado = precioVenta.replace(",", ".").trim();
    const skuFinal = contenido.sku || nombreBaseSku || "";

    const payload: Record<string, unknown> = {
      name: contenido.titulo_seo,
      type: "simple",
      status,
      slug: contenido.slug,
      sku: skuFinal || undefined,
      regular_price: precioNormalizado,
      short_description: contenido.desc_corta_html,
      description: contenido.desc_larga_html,
      catalog_visibility: "visible",
    };

    if (dataUrlPrincipal) {
      payload.images = [
        { src: dataUrlPrincipal, alt: contenido.titulo_seo, name: contenido.titulo_seo },
      ];
    }

    const idsCatPipeline = contenido.woo_category_ids ?? [];
    if (idsCatPipeline.length > 0) {
      payload.categories = idsCatPipeline.map((id) => ({ id }));
    }

    const creado = await createWooProduct(payload);
    const wooId = Number(creado.id);
    if (!Number.isFinite(wooId) || wooId <= 0) {
      throw new Error("WooCommerce no devolvió un id de producto válido.");
    }

    const base = getWooBaseUrl();
    const urlRevisionWoo = `${base}/wp-admin/post.php?post=${wooId}&action=edit`;

    pasos.push("7. Producto creado en WooCommerce.");
    revalidatePath("/admin");
    revalidatePath("/admin/inventario");
    revalidatePath("/inventario");

    const catRes = categoriasResumenSinPasos(contenido, categoriasWoo);

    return {
      ok: true,
      pasos,
      modo: aprobacionRequerida ? "draft" : "publish",
      woo_product_id: wooId,
      titulo_seo: contenido.titulo_seo,
      prompt_foto_2: contenido.prompt_foto_2,
      url_revision_woo: urlRevisionWoo,
      uso_apis: {
        photoroom_llamadas: photoroomLlamadas,
        anthropic_input_tokens: input_tokens,
        anthropic_output_tokens: output_tokens,
      },
      categorias_aplicadas: catRes.aplicadas.length ? catRes.aplicadas : undefined,
      categoria_advertencia: !catRes.aplicadas.length ? catRes.advertencia ?? undefined : undefined,
    };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido.";
    pasos.push(`✖ Error: ${mensaje}`);
    return { ok: false, pasos, error: mensaje };
  }
}

export async function listarBorradoresWooMagico(): Promise<ResultadoListarBorradoresWoo> {
  try {
    await requireAdminActor();
    const raw = await fetchWooDraftProducts({ perPage: 50, page: 1 });
    const base = getWooBaseUrl();
    const items: BorradorWooListadoItem[] = raw.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku ?? "",
      slug: p.slug ?? "",
      date_created: p.date_created,
      desc_corta_resumen: textoPlanoResumido(p.short_description, 180),
      categorias: (p.categories ?? []).map((c) => c.name).join(" · ") || "—",
      url_editar: `${base}/wp-admin/post.php?post=${p.id}&action=edit`,
    }));
    return { ok: true, items };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error al listar borradores.";
    return { ok: false, error: mensaje };
  }
}

export async function publicarBorradorWooMagico(formData: FormData): Promise<ResultadoPublicarBorradorWoo> {
  try {
    await requireAdminActor();
    const id = Math.floor(Number(String(formData.get("woo_product_id") ?? "").trim()));
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false, error: "ID de producto inválido." };
    }
    await updateWooProductPartial(id, { status: "publish" });
    revalidatePath("/admin");
    revalidatePath("/admin/inventario");
    revalidatePath("/inventario");
    return { ok: true };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo publicar el borrador.";
    return { ok: false, error: mensaje };
  }
}
