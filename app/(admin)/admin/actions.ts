"use server";

import { revalidatePath } from "next/cache";

import { parseCsvConEncabezados } from "@/lib/csv-utils";
import {
  ejecutarImportCostosPorSkuDesdeFilas,
  type ResultadoEjecucionImportCostos,
} from "@/lib/import-costos-por-sku";
import {
  upsertFilaMayorista,
  type FilaMayoristaUpsert,
} from "@/lib/inventario-mayorista-upsert";
import { upsertProveedorProducto } from "@/lib/producto-proveedor-upsert";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseServidor } from "@/lib/supabase-servidor";
import { requireAdminOrShopManagerActor, requireStrictAdminActor } from "@/lib/servidor-auth-panel";
import { updateWooProductPartial } from "@/lib/woo";

export type { FilaMayoristaUpsert };

type EstadoUsuario = "pendiente" | "aprobado" | "bloqueado" | "admin" | "shop_manager";

function resolverRolYBloqueo(estado: EstadoUsuario) {
  if (estado === "pendiente") {
    return { rol: "pendiente" as const, bloqueado: false };
  }
  if (estado === "bloqueado") {
    return { rol: "aprobado" as const, bloqueado: true };
  }
  if (estado === "admin") {
    return { rol: "admin" as const, bloqueado: false };
  }
  if (estado === "shop_manager") {
    return { rol: "shop_manager" as const, bloqueado: false };
  }
  return { rol: "aprobado" as const, bloqueado: false };
}

function revalidarAdmin() {
  revalidatePath("/admin");
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/inventario");
  revalidatePath("/inventario");
  revalidatePath("/proveedores");
}

export type ResultadoGuardadoInventarioBulk =
  | { ok: true; guardados: number }
  | { ok: false; error: string };

const MAX_FILAS_GUARDADO_BULK = 40;

export type FilaPrecioWebBulk = {
  woo_product_id: number;
  precio_web: number;
};

export async function guardarCambiosInventarioBulkAction(
  items: FilaMayoristaUpsert[],
): Promise<ResultadoGuardadoInventarioBulk> {
  try {
    await requireAdminOrShopManagerActor();
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, error: "No hay cambios para guardar." };
    }
    if (items.length > MAX_FILAS_GUARDADO_BULK) {
      return {
        ok: false,
        error: `Máximo ${MAX_FILAS_GUARDADO_BULK} productos por envío.`,
      };
    }
    const supabaseAdmin = getSupabaseAdmin();
    for (const item of items) {
      await upsertFilaMayorista(supabaseAdmin, item);
    }
    revalidarAdmin();
    return { ok: true, guardados: items.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al guardar." };
  }
}

export async function guardarPrecioWebInventarioBulkAction(
  items: FilaPrecioWebBulk[],
): Promise<ResultadoGuardadoInventarioBulk> {
  try {
    await requireAdminOrShopManagerActor();
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, error: "No hay cambios de precio web para guardar." };
    }
    if (items.length > MAX_FILAS_GUARDADO_BULK) {
      return {
        ok: false,
        error: `Máximo ${MAX_FILAS_GUARDADO_BULK} productos por envío.`,
      };
    }

    const supabaseAdmin = getSupabaseAdmin();
    for (const item of items) {
      const id = Number(item.woo_product_id);
      const precio = Number(item.precio_web);
      if (!Number.isFinite(id) || id <= 0) {
        return { ok: false, error: "ID de producto inválido en precio web." };
      }
      if (!Number.isFinite(precio) || precio < 0) {
        return { ok: false, error: "Precio web inválido (debe ser mayor o igual a 0)." };
      }
      const precioTxt = Number(precio.toFixed(2)).toFixed(2);

      // Actualiza Woo (precio tienda) y refleja en cache para feedback inmediato en admin.
      await updateWooProductPartial(id, {
        regular_price: precioTxt,
        sale_price: "",
      });
      const { error } = await supabaseAdmin
        .from("woo_product_cache")
        .update({ base_price: Number(precioTxt) })
        .eq("woo_product_id", id);
      if (error) {
        throw new Error(error.message);
      }
    }
    revalidarAdmin();
    return { ok: true, guardados: items.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al guardar precio web." };
  }
}

export type StockStatusWoo = "instock" | "outofstock" | "onbackorder";

export type ResultadoActualizarStockAdmin =
  | { ok: true; stock_status: StockStatusWoo; manage_stock: boolean; stock_quantity: number | null }
  | { ok: false; error: string };

function parseStockRespuestaWoo(data: Record<string, unknown>): {
  stock_status: StockStatusWoo;
  manage_stock: boolean;
  stock_quantity: number | null;
} {
  const rawStatus = String(data.stock_status ?? "instock").toLowerCase();
  const stock_status: StockStatusWoo =
    rawStatus === "outofstock" || rawStatus === "onbackorder" ? rawStatus : "instock";
  const manage_stock = Boolean(data.manage_stock);
  const sq = data.stock_quantity;
  let stock_quantity: number | null = null;
  if (sq != null && sq !== "") {
    const n = Number(sq);
    if (Number.isFinite(n)) {
      stock_quantity = Math.trunc(n);
    }
  }
  return { stock_status, manage_stock, stock_quantity };
}

export async function actualizarStockProductoAdminAction(
  wooProductId: number,
  stockStatus: StockStatusWoo,
): Promise<ResultadoActualizarStockAdmin> {
  try {
    await requireAdminOrShopManagerActor();
    if (!Number.isFinite(wooProductId) || wooProductId <= 0) {
      return { ok: false, error: "Producto inválido." };
    }
    if (stockStatus !== "instock" && stockStatus !== "outofstock" && stockStatus !== "onbackorder") {
      return { ok: false, error: "Estado de stock inválido." };
    }

    let patch: Record<string, unknown>;
    if (stockStatus === "instock") {
      patch = { stock_status: "instock", manage_stock: false };
    } else if (stockStatus === "outofstock") {
      patch = { stock_status: "outofstock", manage_stock: true, stock_quantity: 0 };
    } else {
      patch = { stock_status: "onbackorder", manage_stock: true, stock_quantity: 0 };
    }

    const data = (await updateWooProductPartial(wooProductId, patch)) as Record<string, unknown>;
    const parsed = parseStockRespuestaWoo(data);

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("woo_product_cache")
      .update({
        stock_status: parsed.stock_status,
        manage_stock: parsed.manage_stock,
        stock_quantity: parsed.stock_quantity,
      })
      .eq("woo_product_id", wooProductId);
    if (error) {
      throw new Error(error.message);
    }

    revalidarAdmin();
    return { ok: true, ...parsed };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo actualizar el stock en WooCommerce.",
    };
  }
}

type ResultadoActualizarProveedorAdmin =
  | { ok: true; proveedor_id: string | null }
  | { ok: false; error: string };

export async function actualizarProveedorProductoAdminAction(
  wooProductId: number,
  proveedorId: string | null,
): Promise<ResultadoActualizarProveedorAdmin> {
  try {
    await requireAdminOrShopManagerActor();
    if (!Number.isFinite(wooProductId) || wooProductId <= 0) {
      return { ok: false, error: "Producto inválido." };
    }
    const proveedorNormalizado = proveedorId && proveedorId.trim().length > 0 ? proveedorId.trim() : null;
    await upsertProveedorProducto(getSupabaseAdmin(), wooProductId, proveedorNormalizado);
    revalidarAdmin();
    return { ok: true, proveedor_id: proveedorNormalizado };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo actualizar el proveedor.",
    };
  }
}

export type EstadoImportCostosCsv =
  | { ok: true; detalle: ResultadoEjecucionImportCostos }
  | { ok: false; error: string };

const TAMANO_MAX_CSV_BYTES = 5 * 1024 * 1024;

export async function importarCostosCsvAction(
  _prev: EstadoImportCostosCsv | null,
  formData: FormData,
): Promise<EstadoImportCostosCsv> {
  try {
    await requireAdminOrShopManagerActor();

    const archivo = formData.get("archivo");
    const idxSkuRaw = String(formData.get("columna_sku_idx") ?? "").trim();
    const idxCostoRaw = String(formData.get("columna_costo_idx") ?? "").trim();
    const idxProveedorRaw = String(formData.get("columna_proveedor_idx") ?? "").trim();

    if (!(archivo instanceof File) || archivo.size === 0) {
      return { ok: false, error: "Seleccioná un archivo CSV." };
    }
    if (archivo.size > TAMANO_MAX_CSV_BYTES) {
      return { ok: false, error: "El archivo supera el límite de 5 MB." };
    }

    const texto = await archivo.text();
    const { encabezados, filas } = parseCsvConEncabezados(texto);
    if (encabezados.length === 0) {
      return { ok: false, error: "El CSV está vacío o no tiene encabezados." };
    }

    const iSku = Number.parseInt(idxSkuRaw, 10);
    const iCosto = Number.parseInt(idxCostoRaw, 10);
    if (
      !Number.isFinite(iSku) ||
      !Number.isFinite(iCosto) ||
      iSku < 0 ||
      iCosto < 0 ||
      iSku >= encabezados.length ||
      iCosto >= encabezados.length
    ) {
      return { ok: false, error: "Índices de columnas inválidos. Volvé a elegir SKU y costo." };
    }
    if (iSku === iCosto) {
      return { ok: false, error: "SKU y costo deben ser columnas distintas." };
    }

    let idxProveedor: number | null = null;
    if (idxProveedorRaw !== "" && idxProveedorRaw !== "__sin__") {
      const iP = Number.parseInt(idxProveedorRaw, 10);
      if (
        !Number.isFinite(iP) ||
        iP < 0 ||
        iP >= encabezados.length ||
        iP === iSku ||
        iP === iCosto
      ) {
        return { ok: false, error: "Índice de columna proveedor inválido." };
      }
      idxProveedor = iP;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const detalle = await ejecutarImportCostosPorSkuDesdeFilas(
      supabaseAdmin,
      filas,
      iSku,
      iCosto,
      idxProveedor != null ? { indiceProveedor: idxProveedor } : undefined,
    );

    const { error: logErr } = await supabaseAdmin.from("importaciones_inventario_csv").insert({
      nombre_archivo: archivo.name,
      mapeo: {
        columna_sku_idx: iSku,
        columna_costo_idx: iCosto,
        columna_proveedor_idx: idxProveedor,
      },
      resultado: detalle as unknown as Record<string, unknown>,
    });
    if (logErr && !logErr.message.includes("Could not find the table")) {
      console.warn("[importaciones_inventario_csv]", logErr.message);
    }

    revalidarAdmin();
    return { ok: true, detalle };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al importar." };
  }
}

export async function crearUsuarioAdminAction(formData: FormData) {
  await requireStrictAdminActor();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nombreEmpresa = String(formData.get("nombre_empresa") ?? "").trim();
  const rut = String(formData.get("rut") ?? "").trim();
  const estado = String(formData.get("estado") ?? "pendiente") as EstadoUsuario;

  if (!email || !password) {
    throw new Error("Email y password son obligatorios.");
  }
  if (!["pendiente", "aprobado", "bloqueado", "admin", "shop_manager"].includes(estado)) {
    throw new Error("Estado invalido.");
  }

  const { rol, bloqueado } = resolverRolYBloqueo(estado);
  const supabaseAdmin = getSupabaseAdmin();

  const { data: creado, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      nombre_empresa: nombreEmpresa || null,
    },
  });

  if (createError || !creado.user) {
    throw new Error(createError?.message ?? "No se pudo crear el usuario.");
  }

  const { error: perfilError } = await supabaseAdmin.from("perfiles_usuarios").upsert(
    {
      id: creado.user.id,
      rol,
      nombre_empresa: nombreEmpresa || null,
      rut: rut || null,
      datos_onboarding: { bloqueado },
    },
    { onConflict: "id" },
  );

  if (perfilError) {
    throw new Error(perfilError.message);
  }

  revalidarAdmin();
}

export async function actualizarUsuarioAdminAction(formData: FormData) {
  const idUsuario = String(formData.get("id_usuario") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nombreEmpresa = String(formData.get("nombre_empresa") ?? "").trim();
  const rut = String(formData.get("rut") ?? "").trim();
  const estado = String(formData.get("estado") ?? "pendiente") as EstadoUsuario;

  if (!idUsuario || !email) {
    throw new Error("Faltan datos obligatorios del usuario.");
  }
  if (!["pendiente", "aprobado", "bloqueado", "admin", "shop_manager"].includes(estado)) {
    throw new Error("Estado invalido.");
  }

  await requireStrictAdminActor();

  const supabaseAdmin = getSupabaseAdmin();

  const { data: perfilActual } = await supabaseAdmin
    .from("perfiles_usuarios")
    .select("rol")
    .eq("id", idUsuario)
    .maybeSingle();

  const supabaseServidor = await getSupabaseServidor();
  const {
    data: { user: usuarioActor },
  } = await supabaseServidor.auth.getUser();

  if (!usuarioActor) {
    throw new Error("Sesion invalida.");
  }

  let { rol, bloqueado } = resolverRolYBloqueo(estado);
  if (perfilActual?.rol === "shop_manager" && estado === "bloqueado") {
    rol = "shop_manager";
    bloqueado = true;
  }

  if (
    usuarioActor.id === idUsuario &&
    perfilActual?.rol === "admin" &&
    rol !== "admin"
  ) {
    throw new Error(
      "No podes quitarte el rol administrador desde tu propia sesion. Usa otra cuenta admin o la consola de Supabase.",
    );
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(idUsuario, {
    email,
    user_metadata: {
      nombre_empresa: nombreEmpresa || null,
    },
  });

  if (authError) {
    throw new Error(authError.message);
  }

  const { error: perfilError } = await supabaseAdmin.from("perfiles_usuarios").upsert(
    {
      id: idUsuario,
      rol,
      nombre_empresa: nombreEmpresa || null,
      rut: rut || null,
      datos_onboarding: { bloqueado },
    },
    { onConflict: "id" },
  );

  if (perfilError) {
    throw new Error(perfilError.message);
  }

  revalidarAdmin();
}

export async function borrarUsuarioAdminAction(formData: FormData) {
  const idUsuario = String(formData.get("id_usuario") ?? "");
  if (!idUsuario) {
    throw new Error("No se recibio el id del usuario.");
  }

  await requireStrictAdminActor();

  const supabaseServidor = await getSupabaseServidor();
  const {
    data: { user: usuarioActor },
  } = await supabaseServidor.auth.getUser();

  if (usuarioActor?.id === idUsuario) {
    throw new Error("No podes borrar tu propia cuenta desde el panel.");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.auth.admin.deleteUser(idUsuario, false);
  if (error) {
    throw new Error(error.message);
  }

  revalidarAdmin();
}

/** Conservado por compatibilidad (formularios legacy); el inventario usa guardarCambiosInventarioBulkAction. */
export async function actualizarProductoMayoristaAction(formData: FormData) {
  await requireAdminOrShopManagerActor();

  const wooProductId = Number(formData.get("woo_product_id"));
  const nombre = String(formData.get("nombre") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const precioBaseWoo = Number(formData.get("precio_base_woo"));
  const precioMayoristaRaw = String(formData.get("precio_mayorista") ?? "").trim();
  const precioCostoRaw = String(formData.get("precio_costo") ?? "").trim();
  const ventasMayoristaRaw = String(formData.get("ventas_mayorista") ?? "0").trim();
  const activo = formData.get("activo") === "on";

  if (!Number.isFinite(wooProductId) || wooProductId <= 0 || !nombre) {
    throw new Error("Producto invalido.");
  }

  const precioMayorista =
    precioMayoristaRaw.length > 0 ? Number.parseFloat(precioMayoristaRaw) : precioBaseWoo;
  if (!Number.isFinite(precioMayorista) || precioMayorista < 0) {
    throw new Error("Precio mayorista invalido.");
  }

  const precioCosto =
    precioCostoRaw.length > 0 ? Number.parseFloat(precioCostoRaw.replace(",", ".")) : 0;
  if (!Number.isFinite(precioCosto) || precioCosto < 0) {
    throw new Error("Precio costo invalido.");
  }

  const ventasMayorista = Number.parseInt(ventasMayoristaRaw, 10);
  if (!Number.isFinite(ventasMayorista) || ventasMayorista < 0) {
    throw new Error("Ventas mayorista invalidas.");
  }

  await upsertFilaMayorista(getSupabaseAdmin(), {
    woo_product_id: wooProductId,
    nombre,
    sku: sku || null,
    precio_base_woo: precioBaseWoo,
    precio_mayorista: precioMayorista,
    precio_costo: precioCosto,
    ventas_mayorista: ventasMayorista,
    activo,
  });

  revalidarAdmin();
}
