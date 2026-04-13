"use server";

import { revalidatePath } from "next/cache";
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

import type { WooPedidoAdmin } from "@/lib/woo-pedido-admin-types";
import {
  ESTADOS_PEDIDO_CONTEO,
  type ListarPedidosAdminParams,
  type ListarPedidosAdminResult,
  type ResultadoActualizarEstadoPedido,
} from "@/lib/pedidos-admin-listado";
import { rangoDefaultPedidos } from "@/lib/rango-fechas-pedidos";
import { requireAdminOrShopManagerActor } from "@/lib/servidor-auth-panel";

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

function extraerMensajeError(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  if (data && typeof data === "object") {
    const mensaje = (data as { message?: unknown }).message;
    if (typeof mensaje === "string" && mensaje.trim()) return mensaje;
    const err = (data as { error?: unknown }).error;
    if (typeof err === "string" && err.trim()) return err;
  }
  if (typeof data === "string" && data.trim()) return data;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function leerCabeceraTotal(resp: { headers?: unknown }): number {
  const headers = resp.headers;
  if (!headers || typeof headers !== "object") return 0;
  const h = headers as Record<string, string>;
  const claves = ["x-wp-total", "X-WP-Total"];
  for (const c of claves) {
    const v = h[c];
    if (v !== undefined) {
      const n = Number.parseInt(String(v), 10);
      return Number.isFinite(n) ? n : 0;
    }
  }
  const entry = Object.entries(h).find(([k]) => k.toLowerCase() === "x-wp-total");
  if (!entry) return 0;
  const n = Number.parseInt(String(entry[1]), 10);
  return Number.isFinite(n) ? n : 0;
}

function fechaIsoValida(valor: string | undefined): valor is string {
  return Boolean(valor && /^\d{4}-\d{2}-\d{2}$/.test(valor));
}

function resolverRangoFechas(fechaDesde?: string, fechaHasta?: string) {
  const def = rangoDefaultPedidos();
  let desde = fechaIsoValida(fechaDesde) ? fechaDesde : def.desde;
  let hasta = fechaIsoValida(fechaHasta) ? fechaHasta : def.hasta;
  if (desde > hasta) {
    const t = desde;
    desde = hasta;
    hasta = t;
  }
  return { desde, hasta };
}

function paramsFechaWoo(desde: string, hasta: string) {
  return {
    after: `${desde}T00:00:00`,
    before: `${hasta}T23:59:59`,
  };
}

function normalizarPedidos(crudos: WooPedidoAdmin[]): WooPedidoAdmin[] {
  return crudos.map((p) => ({
    ...p,
    status: typeof p.status === "string" && p.status.trim() ? p.status.trim() : "pending",
  }));
}

export async function listarPedidosAdmin(params: ListarPedidosAdminParams): Promise<ListarPedidosAdminResult> {
  try {
    await requireAdminOrShopManagerActor();
    const woo = getWooClient();
    const pagina = Math.max(1, Math.floor(Number(params.pagina) || 1));
    const rawPor = Number(params.porPagina) || 20;
    const porPagina = [20, 50, 100].includes(rawPor) ? rawPor : 20;
    const { desde: desdeEf, hasta: hastaEf } = resolverRangoFechas(params.fechaDesde, params.fechaHasta);
    const fechaParams = paramsFechaWoo(desdeEf, hastaEf);
    const estadoFiltro = params.estado?.trim() ?? "";

    const queryLista: Record<string, string | number> = {
      page: pagina,
      per_page: porPagina,
      orderby: "date",
      order: "desc",
    };
    queryLista.after = fechaParams.after;
    queryLista.before = fechaParams.before;
    queryLista.status = estadoFiltro || "any";

    const peticionesConteo = [
      ...ESTADOS_PEDIDO_CONTEO.map((st) =>
        woo.get("orders", {
          ...fechaParams,
          status: st,
          per_page: 1,
          page: 1,
        }),
      ),
      woo.get("orders", {
        ...fechaParams,
        status: "any",
        per_page: 1,
        page: 1,
      }),
    ];

    const [respLista, ...respConteos] = await Promise.all([woo.get("orders", queryLista), ...peticionesConteo]);

    const crudos = (respLista.data as WooPedidoAdmin[]) ?? [];
    const pedidos = normalizarPedidos(crudos);
    const total = leerCabeceraTotal(respLista);
    const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

    const conteosPorEstado: Record<string, number> = {};
    ESTADOS_PEDIDO_CONTEO.forEach((st, i) => {
      conteosPorEstado[st] = leerCabeceraTotal(respConteos[i]);
    });
    conteosPorEstado.total = leerCabeceraTotal(respConteos[ESTADOS_PEDIDO_CONTEO.length]);

    return {
      ok: true,
      pedidos,
      total,
      totalPaginas,
      pagina,
      porPagina,
      fechaDesde: desdeEf,
      fechaHasta: hastaEf,
      estado: estadoFiltro,
      conteosPorEstado,
    };
  } catch (e) {
    return { ok: false, error: extraerMensajeError(e, "No se pudieron cargar los pedidos.") };
  }
}

export async function actualizarEstadoPedido(
  id: number,
  estado: string,
): Promise<ResultadoActualizarEstadoPedido> {
  try {
    await requireAdminOrShopManagerActor();
    const woo = getWooClient();
    const { data } = await woo.put(`orders/${id}`, { status: estado });
    const actualizado = data as { status?: string } | undefined;
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin");
    return { ok: true, status: actualizado?.status ?? estado };
  } catch (e) {
    return { ok: false, error: extraerMensajeError(e, "No se pudo actualizar el estado.") };
  }
}
