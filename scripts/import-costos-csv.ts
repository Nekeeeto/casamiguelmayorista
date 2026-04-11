/**
 * Importa costos desde un CSV (columna A = código/SKU, columna D = COSTO).
 * Empareja con woo_product_cache.sku y actualiza precio_costo en productos_mayoristas
 * (o wholesale_products si la tabla nueva no existe).
 *
 * Uso:
 *   npm run import-costos -- "ruta/al/archivo.csv"
 *   (sin argumento usa ./data/costos-golosinas.csv si existe)
 *
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 *
 * La tabla de costos debe tener columna precio_costo:
 * - productos_mayoristas (schema fase 3) o
 * - wholesale_products: ejecutá supabase/schema_phase4_inventario_metricas.sql
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function cargarEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) {
    return;
  }
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      continue;
    }
    const eq = t.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function parseLineaCsv(linea: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      entreComillas = !entreComillas;
    } else if (c === "," && !entreComillas) {
      celdas.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  celdas.push(actual);
  return celdas.map((s) => s.trim());
}

function parsearCosto(celda: string): number | null {
  const limpio = celda.replaceAll('"', "").replaceAll("UYU", "").trim();
  if (!limpio) {
    return null;
  }
  const n = Number.parseFloat(limpio.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Number(n.toFixed(2));
}

function normalizarSku(s: string): string {
  return s.trim();
}

type FilaCache = {
  woo_product_id: number;
  sku: string | null;
  name: string;
  base_price: number | string | null;
};

async function columnaPrecioCostoWholesale(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("wholesale_products").select("precio_costo").limit(1);
  if (!error) {
    return true;
  }
  if (error.message.includes("precio_costo") || error.message.includes("schema cache")) {
    return false;
  }
  throw new Error(`wholesale_products: ${error.message}`);
}

async function tablaProductosMayoristasDisponible(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("productos_mayoristas").select("woo_product_id").limit(1);
  if (!error) {
    return true;
  }
  if (
    error.message.includes("Could not find the table") ||
    error.message.includes("schema cache")
  ) {
    return false;
  }
  throw new Error(`productos_mayoristas: ${error.message}`);
}

async function main() {
  cargarEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (.env.local).");
    process.exit(1);
  }

  const argCsv = process.argv[2];
  const porDefecto = resolve(process.cwd(), "data", "costos-golosinas.csv");
  const rutaAbs = argCsv ? resolve(argCsv) : porDefecto;

  if (!existsSync(rutaAbs)) {
    if (!argCsv) {
      console.error(
        'Pasá la ruta al CSV, ej: npm run import-costos -- "C:\\ruta\\archivo.csv"\n' +
          `O colocá el archivo en ${porDefecto}`,
      );
    } else {
      console.error(`No existe el archivo: ${rutaAbs}`);
    }
    process.exit(1);
  }

  let contenido = readFileSync(rutaAbs, "utf8");
  if (contenido.charCodeAt(0) === 0xfeff) {
    contenido = contenido.slice(1);
  }
  const lineas = contenido.split(/\r?\n/).filter((l) => l.trim().length > 0);

  /** SKU normalizado (mayúsculas) -> costo (último gana si hay duplicados en CSV) */
  const costoPorSku = new Map<string, number>();
  const duplicadosCsv = new Set<string>();

  for (let i = 0; i < lineas.length; i++) {
    const celdas = parseLineaCsv(lineas[i]);
    if (i === 0 && celdas[0]?.toUpperCase().includes("CÓDIGO")) {
      continue;
    }
    const codigo = normalizarSku(celdas[0] ?? "");
    if (!codigo) {
      continue;
    }
    const costo = parsearCosto(celdas[3] ?? "");
    if (costo == null) {
      continue;
    }
    const clave = codigo.toUpperCase();
    if (costoPorSku.has(clave)) {
      duplicadosCsv.add(clave);
    }
    costoPorSku.set(clave, costo);
  }

  if (duplicadosCsv.size > 0) {
    console.warn(
      `Aviso: ${duplicadosCsv.size} SKU duplicados en el CSV; se usó el último COSTO por cada uno.`,
    );
  }

  console.log(`Filas CSV con costo válido: ${costoPorSku.size}`);

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let usarPm: boolean;
  try {
    usarPm = await tablaProductosMayoristasDisponible(supabase);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  if (!usarPm) {
    console.log("Usando tabla legacy wholesale_products.");
    try {
      const okCosto = await columnaPrecioCostoWholesale(supabase);
      if (!okCosto) {
        console.error(
          "La tabla wholesale_products no tiene columna precio_costo. Ejecutá en Supabase el SQL de",
          "supabase/schema_phase4_inventario_metricas.sql (bloque DO que altera wholesale_products).",
        );
        process.exit(1);
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  } else {
    const { error: pmCostoErr } = await supabase
      .from("productos_mayoristas")
      .select("precio_costo")
      .limit(1);
    if (pmCostoErr && pmCostoErr.message.includes("precio_costo")) {
      console.error(
        "productos_mayoristas sin columna precio_costo. Revisá migraciones en supabase/schema_phase3_b2b_core.sql",
      );
      process.exit(1);
    }
    if (pmCostoErr) {
      console.error(pmCostoErr.message);
      process.exit(1);
    }
  }

  const { data: cacheRows, error: cacheError } = await supabase
    .from("woo_product_cache")
    .select("woo_product_id, sku, name, base_price");

  if (cacheError) {
    console.error("woo_product_cache:", cacheError.message);
    process.exit(1);
  }

  const filas = (cacheRows ?? []) as FilaCache[];
  const porSku = new Map<string, FilaCache[]>();
  for (const fila of filas) {
    const sku = normalizarSku(fila.sku ?? "");
    if (!sku) {
      continue;
    }
    const clave = sku.toUpperCase();
    const lista = porSku.get(clave) ?? [];
    lista.push(fila);
    porSku.set(clave, lista);
  }

  let actualizados = 0;
  let creados = 0;
  let sinMatch = 0;
  const skuSinMatch: string[] = [];

  const idsObjetivo = new Set<number>();
  for (const [skuKey] of costoPorSku) {
    const coincidencias = porSku.get(skuKey);
    if (!coincidencias?.length) {
      sinMatch += 1;
      if (skuSinMatch.length < 40) {
        skuSinMatch.push(skuKey);
      }
      continue;
    }
    for (const c of coincidencias) {
      idsObjetivo.add(Number(c.woo_product_id));
    }
  }

  const idsArr = [...idsObjetivo];
  const existentesPm = new Map<
    number,
    { precio_venta: number; ventas_mayorista: number; nombre: string; sku: string | null; activo: boolean }
  >();

  if (usarPm && idsArr.length > 0) {
    const { data: pmRows, error: pmErr } = await supabase
      .from("productos_mayoristas")
      .select("woo_product_id, precio_venta, ventas_mayorista, nombre, sku, activo")
      .in("woo_product_id", idsArr);

    if (pmErr) {
      console.error("productos_mayoristas:", pmErr.message);
      process.exit(1);
    }
    for (const row of (pmRows ?? []) as {
      woo_product_id: number;
      precio_venta: number | null;
      ventas_mayorista: number | null;
      nombre: string;
      sku: string | null;
      activo: boolean;
    }[]) {
      existentesPm.set(Number(row.woo_product_id), {
        precio_venta: Number(row.precio_venta ?? 0),
        ventas_mayorista: Number(row.ventas_mayorista ?? 0),
        nombre: row.nombre,
        sku: row.sku,
        activo: row.activo,
      });
    }
  }

  const existentesWp = new Map<
    number,
    { custom_price: number | null; name: string; sku: string | null; is_active: boolean }
  >();

  if (!usarPm && idsArr.length > 0) {
    const { data: wpRows, error: wpErr } = await supabase
      .from("wholesale_products")
      .select("woo_product_id, custom_price, name, sku, is_active")
      .in("woo_product_id", idsArr);

    if (wpErr) {
      console.error("wholesale_products:", wpErr.message);
      process.exit(1);
    }
    for (const row of (wpRows ?? []) as {
      woo_product_id: number;
      custom_price: number | null;
      name: string;
      sku: string | null;
      is_active: boolean;
    }[]) {
      existentesWp.set(Number(row.woo_product_id), {
        custom_price: row.custom_price,
        name: row.name,
        sku: row.sku,
        is_active: row.is_active,
      });
    }
  }

  for (const [skuKey, costo] of costoPorSku) {
    const coincidencias = porSku.get(skuKey);
    if (!coincidencias?.length) {
      continue;
    }

    for (const cache of coincidencias) {
      const wooId = Number(cache.woo_product_id);
      const precioBase = Number(cache.base_price ?? 0);

      if (usarPm) {
        const prev = existentesPm.get(wooId);
        if (prev) {
          const { error } = await supabase
            .from("productos_mayoristas")
            .update({ precio_costo: costo })
            .eq("woo_product_id", wooId);
          if (error) {
            console.error(`Update woo_product_id=${wooId}:`, error.message);
            continue;
          }
          actualizados += 1;
        } else {
          const { error } = await supabase.from("productos_mayoristas").insert({
            woo_product_id: wooId,
            nombre: cache.name,
            sku: cache.sku ?? skuKey,
            precio_venta: Number.isFinite(precioBase) && precioBase >= 0 ? Number(precioBase.toFixed(2)) : 0,
            precio_costo: costo,
            activo: true,
            ventas_mayorista: 0,
            escalas_volumen: [],
          });
          if (error) {
            console.error(`Insert woo_product_id=${wooId}:`, error.message);
            continue;
          }
          creados += 1;
          existentesPm.set(wooId, {
            precio_venta: precioBase,
            ventas_mayorista: 0,
            nombre: cache.name,
            sku: cache.sku,
            activo: true,
          });
        }
      } else {
        const prev = existentesWp.get(wooId);
        if (prev) {
          const { error } = await supabase
            .from("wholesale_products")
            .update({ precio_costo: costo })
            .eq("woo_product_id", wooId);
          if (error) {
            console.error(`Update legacy woo_product_id=${wooId}:`, error.message);
            continue;
          }
          actualizados += 1;
        } else {
          const { error } = await supabase.from("wholesale_products").insert({
            woo_product_id: wooId,
            name: cache.name,
            sku: cache.sku ?? skuKey,
            custom_price: Number.isFinite(precioBase) && precioBase >= 0 ? Number(precioBase.toFixed(2)) : null,
            precio_costo: costo,
            is_active: true,
            min_quantity: 1,
          });
          if (error) {
            console.error(`Insert legacy woo_product_id=${wooId}:`, error.message);
            continue;
          }
          creados += 1;
        }
      }
    }
  }

  console.log("—");
  console.log(`Actualizados (solo costo): ${actualizados}`);
  console.log(`Filas nuevas en inventario mayorista: ${creados}`);
  console.log(`SKUs del CSV sin match en catálogo (Woo caché): ${sinMatch}`);
  if (skuSinMatch.length > 0) {
    console.log("Ejemplos sin match:", skuSinMatch.join(", "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
