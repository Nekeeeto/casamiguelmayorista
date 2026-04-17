import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

export type WooCategoriaProducto = {
  id: number;
  name: string;
  slug: string;
};

export type WooProduct = {
  id: number;
  /** simple | variation | variable | grouped | external */
  type?: string;
  /** Solo variaciones: ID del producto variable padre. */
  parent_id?: number;
  name: string;
  sku: string;
  status: string;
  date_modified_gmt: string | null;
  price: string;
  regular_price: string;
  sale_price: string;
  /** Unidades vendidas en la tienda Woo (REST wc/v3 products). Suele venir con context=edit. */
  total_sales?: number | string;
  stock_status?: string;
  manage_stock?: boolean;
  stock_quantity?: number | string | null;
  images: Array<{ id?: number; src: string; name?: string; alt?: string }>;
  categories?: WooCategoriaProducto[];
};

export type WooCategoriaArbol = {
  id: number;
  name: string;
  slug: string;
  parent: number;
};

function getWooEnv(name: "WOO_URL" | "WOO_KEY" | "WOO_SECRET") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getWooClient() {
  return new WooCommerceRestApi({
    url: getWooEnv("WOO_URL"),
    consumerKey: getWooEnv("WOO_KEY"),
    consumerSecret: getWooEnv("WOO_SECRET"),
    version: "wc/v3",
  });
}

function getWpMediaCreds() {
  const username = process.env.WP_APP_USER ?? process.env.WOO_WP_USER ?? "";
  const password = process.env.WP_APP_PASSWORD ?? process.env.WOO_WP_APP_PASSWORD ?? "";
  if (!username || !password) return null;
  return { username, password };
}

function extraerMensajeError(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  if (data && typeof data === "object") {
    const mensaje = (data as { message?: unknown; error?: unknown }).message;
    if (typeof mensaje === "string" && mensaje.trim()) return mensaje;
    const err = (data as { message?: unknown; error?: unknown }).error;
    if (typeof err === "string" && err.trim()) return err;
  }
  if (typeof data === "string" && data.trim()) return data;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function dataUrlABuffer(dataUrl: string): { mime: string; extension: string; contenido: ArrayBuffer } {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error("Formato de imagen invalido (se esperaba data URL base64).");
  }
  const mime = match[1].toLowerCase();
  const base64 = match[2];
  const raw = Buffer.from(base64, "base64");
  const contenido = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const extension = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { mime, extension, contenido };
}

async function subirDataUrlAWpMedia(dataUrl: string, index: number) {
  const creds = getWpMediaCreds();
  if (!creds) {
    throw new Error(
      "No se pueden subir imagenes nuevas: falta configurar WP_APP_USER y WP_APP_PASSWORD en .env.local.",
    );
  }

  const { mime, extension, contenido } = dataUrlABuffer(dataUrl);
  const siteUrl = getWooEnv("WOO_URL").replace(/\/+$/, "");
  const endpoint = `${siteUrl}/wp-json/wp/v2/media`;
  const auth = Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
  const filename = `producto-${Date.now()}-${index}.${extension}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: new Blob([contenido], { type: mime }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: unknown; source_url?: unknown; message?: unknown; code?: unknown }
    | null;

  if (!response.ok) {
    const detalle =
      typeof payload?.message === "string" && payload.message.trim()
        ? payload.message
        : `HTTP ${response.status}`;
    throw new Error(`WordPress media rechazo la subida: ${detalle}`);
  }

  const id = Number(payload?.id);
  const sourceUrl = typeof payload?.source_url === "string" ? payload.source_url : "";
  if (!Number.isFinite(id) || id <= 0 || !sourceUrl) {
    throw new Error("WordPress media no devolvio id/source_url valido.");
  }

  return { id, sourceUrl };
}

async function normalizarPatchImagenes(
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rawImages = patch.images;
  if (!Array.isArray(rawImages)) return patch;

  const imagesNormalizadas: Record<string, unknown>[] = [];
  for (let i = 0; i < rawImages.length; i += 1) {
    const raw = rawImages[i] as Record<string, unknown>;
    const src = typeof raw.src === "string" ? raw.src.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const alt = typeof raw.alt === "string" ? raw.alt.trim() : "";
    const idNum = Number(raw.id);

    if (src.startsWith("data:")) {
      const media = await subirDataUrlAWpMedia(src, i + 1);
      const nueva: Record<string, unknown> = { id: media.id };
      if (name) nueva.name = name;
      if (alt) nueva.alt = alt;
      imagesNormalizadas.push(nueva);
      continue;
    }

    const actual: Record<string, unknown> = {};
    if (Number.isFinite(idNum) && idNum > 0) actual.id = idNum;
    if (src) actual.src = src;
    if (name) actual.name = name;
    if (alt) actual.alt = alt;
    if (Object.keys(actual).length > 0) imagesNormalizadas.push(actual);
  }

  return { ...patch, images: imagesNormalizadas };
}

export type FetchWooProductsOptions = {
  /** If set, stop after this many products (single or paginated fetch). */
  maxProducts?: number;
};

export async function fetchAllWooProducts(options?: FetchWooProductsOptions) {
  const woo = getWooClient();
  const maxProducts = options?.maxProducts;

  if (maxProducts != null && maxProducts > 0) {
    const { data } = await woo.get("products", {
      per_page: Math.min(100, maxProducts),
      page: 1,
      status: "publish",
      orderby: "date",
      order: "desc",
      context: "edit",
    });

    return (data as WooProduct[]).slice(0, maxProducts);
  }

  const products: WooProduct[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { data } = await woo.get("products", {
      per_page: 100,
      page,
      status: "publish",
      orderby: "date",
      order: "desc",
      context: "edit",
    });

    const batch = data as WooProduct[];
    products.push(...batch);

    hasMore = batch.length === 100;
    page += 1;

    if (page > 30) {
      break;
    }
  }

  return products;
}

export async function fetchWooProductById(productId: number) {
  const woo = getWooClient();
  const { data } = await woo.get(`products/${productId}`, { context: "edit" });
  return data as WooProduct;
}

type FilaReporteTopSeller = {
  product_id?: string | number;
  quantity?: string | number;
};

/**
 * Unidades vendidas por producto (REST `reports/sales/top_sellers` + rango de fechas).
 * Sirve de respaldo cuando `total_sales` en `GET products` viene siempre 0 (p. ej. algunos entornos HPOS).
 */
export async function fetchMapCantidadesVendidasReporteTopSellers(
  dateMin: string,
  dateMax: string,
): Promise<Map<number, number>> {
  const woo = getWooClient();
  const { data } = await woo.get("reports/sales/top_sellers", {
    filter: { date_min: dateMin, date_max: dateMax },
  });
  const merged = new Map<number, number>();
  const payload = data as { top_sellers?: FilaReporteTopSeller[] };
  for (const row of payload.top_sellers ?? []) {
    const id = Number(row.product_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const qty = Math.trunc(
      Number.parseFloat(String(row.quantity ?? "0").replace(/\s/g, "").replace(",", ".")),
    );
    if (!Number.isFinite(qty) || qty < 0) continue;
    merged.set(id, (merged.get(id) ?? 0) + qty);
  }
  return merged;
}

/** Pedido Woo REST crudo (útil para inspeccionar `meta_data`, envíos, etc.). */
export async function fetchWooOrderRawById(orderId: number) {
  const woo = getWooClient();
  const { data } = await woo.get(`orders/${orderId}`, { context: "edit" });
  return data as Record<string, unknown>;
}

/** Respuesta cruda completa de Woo (sin filtrar campos). */
export async function fetchWooProductRawById(productId: number) {
  const woo = getWooClient();
  const { data } = await woo.get(`products/${productId}`, { context: "edit" });
  return data as Record<string, unknown>;
}

/** PUT parcial de un producto Woo: envía solo los campos modificados. */
export async function updateWooProductPartial(
  productId: number,
  patch: Record<string, unknown>,
) {
  const woo = getWooClient();
  try {
    const patchNormalizado = await normalizarPatchImagenes(patch);
    const { data } = await woo.put(`products/${productId}`, patchNormalizado);
    return data as Record<string, unknown>;
  } catch (error) {
    throw new Error(extraerMensajeError(error, "No se pudo actualizar el producto en Woo."));
  }
}

/** POST nuevo producto Woo (imágenes data URL se suben a la mediateca vía credenciales WP). */
export async function createWooProduct(payload: Record<string, unknown>) {
  const woo = getWooClient();
  try {
    const cuerpo = await normalizarPatchImagenes(payload);
    const { data } = await woo.post("products", cuerpo);
    return data as Record<string, unknown>;
  } catch (error) {
    throw new Error(extraerMensajeError(error, "No se pudo crear el producto en Woo."));
  }
}

/** Base URL del sitio Woo (sin barra final). Solo servidor. */
export function getWooBaseUrl() {
  return getWooEnv("WOO_URL").replace(/\/+$/, "");
}

export async function fetchAllWooProductCategories() {
  const woo = getWooClient();
  const categorias: WooCategoriaArbol[] = [];
  let pagina = 1;
  let hayMas = true;

  while (hayMas) {
    const { data } = await woo.get("products/categories", {
      per_page: 100,
      page: pagina,
    });

    const lote = (data as WooCategoriaArbol[]) ?? [];
    categorias.push(...lote);
    hayMas = lote.length === 100;
    pagina += 1;

    if (pagina > 50) {
      break;
    }
  }

  return categorias;
}

export type WooProductBorradorResumen = {
  id: number;
  name: string;
  sku: string;
  slug: string;
  status: string;
  short_description: string;
  description: string;
  permalink?: string;
  date_created?: string;
  categories?: WooCategoriaProducto[];
};

/** Productos en estado borrador (para revisión / publicación). */
export async function fetchWooDraftProducts(options?: { perPage?: number; page?: number }) {
  const woo = getWooClient();
  const perPage = Math.min(100, Math.max(1, options?.perPage ?? 40));
  const page = Math.max(1, options?.page ?? 1);
  const { data } = await woo.get("products", {
    per_page: perPage,
    page,
    status: "draft",
    orderby: "date",
    order: "desc",
    context: "edit",
  });
  return (data as WooProductBorradorResumen[]) ?? [];
}
