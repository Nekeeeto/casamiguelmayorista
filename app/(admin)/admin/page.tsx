import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  actualizarUsuarioAdminAction,
  borrarUsuarioAdminAction,
  crearUsuarioAdminAction,
} from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminDashboardHeader } from "@/components/admin/admin-dashboard-header";
import { AdminPanelTecnicoDisclosure } from "@/components/admin/admin-panel-tecnico-disclosure";
import { AnaliticasVentasWebMetaTecnica } from "@/components/admin/analiticas-ventas-web-meta-tecnica";
import { ImportadorCostosInventario } from "@/components/admin/importador-costos-inventario";
import { InventarioPanelCliente } from "@/components/admin/inventario-panel-cliente";
import { InventarioSyncManualFlotante } from "@/components/admin/inventario-sync-manual-flotante";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseServidor } from "@/lib/supabase-servidor";
import { idsCategoriaMasDescendientes } from "@/lib/inventario-categorias";
import {
  cargarAnaliticasVentasWeb,
  type CargaAnaliticasVentasWeb,
} from "@/lib/analiticas-ventas-web-data";
import { estadosPedidoWooAnaliticasResumen } from "@/lib/woo-order-statuses-analiticas";
import { AnaliticasVentasWebLazy } from "@/components/admin/analiticas-ventas-web-lazy";
import { AnaliticasVentasWebRangoForm } from "@/components/admin/analiticas-ventas-web-rango-form";

type FilaCategoriaCache = {
  woo_term_id: number;
  nombre: string;
  id_padre: number;
};

type EstadoPestana = "usuarios" | "inventario" | "analiticas";

type PerfilUsuario = {
  id: string;
  rol: "admin" | "pendiente" | "aprobado" | "shop_manager";
  nombre_empresa: string | null;
  rut: string | null;
  datos_onboarding: { bloqueado?: boolean } | null;
};

type UsuarioAdmin = {
  id: string;
  email: string;
  nombre_empresa: string | null;
  rut: string | null;
  estado: "pendiente" | "aprobado" | "bloqueado" | "admin" | "shop_manager";
  es_admin: boolean;
};

function resolverEstado(perfil: PerfilUsuario | undefined) {
  if (!perfil) {
    return "pendiente" as const;
  }
  if (perfil.datos_onboarding?.bloqueado) {
    return "bloqueado" as const;
  }
  if (perfil.rol === "admin") {
    return "admin" as const;
  }
  if (perfil.rol === "shop_manager") {
    return "shop_manager" as const;
  }
  return perfil.rol;
}

function fechaIsoValida(valor: string | undefined): valor is string {
  return Boolean(valor && /^\d{4}-\d{2}-\d{2}$/.test(valor));
}

function rangoFechasAnaliticas(desdeParam?: string, hastaParam?: string) {
  const hoy = new Date();
  const hastaDefault = hoy.toISOString().slice(0, 10);
  const desdeBase = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()),
  );
  desdeBase.setUTCDate(desdeBase.getUTCDate() - 30);
  const desdeDefault = desdeBase.toISOString().slice(0, 10);

  let desde = fechaIsoValida(desdeParam) ? desdeParam : desdeDefault;
  let hasta = fechaIsoValida(hastaParam) ? hastaParam : hastaDefault;
  if (desde > hasta) {
    const tmp = desde;
    desde = hasta;
    hasta = tmp;
  }
  return { desde, hasta };
}

/** Next puede devolver string | string[] en query params. */
function parametroTexto(valor: string | string[] | undefined): string | undefined {
  if (valor === undefined) {
    return undefined;
  }
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function AdminGeneralPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tab = parametroTexto(sp.tab);
  const analiticaParam = parametroTexto(sp.analitica) ?? "";
  const desdeAnaliticaParam = parametroTexto(sp.desde);
  const hastaAnaliticaParam = parametroTexto(sp.hasta);
  const acategoriaAnaliticaParam = parametroTexto(sp.acategoria) ?? "";
  const pestanaActiva: EstadoPestana =
    tab === "inventario" ? "inventario" : tab === "analiticas" ? "analiticas" : "usuarios";
  const supabaseAdmin = getSupabaseAdmin();
  const supabaseServidor = await getSupabaseServidor();
  const {
    data: { user: usuarioSesion },
  } = await supabaseServidor.auth.getUser();
  const idUsuarioSesion = usuarioSesion?.id ?? null;

  const { data: perfilSesion } = await supabaseServidor
    .from("perfiles_usuarios")
    .select("rol")
    .eq("id", idUsuarioSesion ?? "")
    .maybeSingle();
  const esShopManager = perfilSesion?.rol === "shop_manager";

  if (esShopManager && pestanaActiva !== "inventario") {
    redirect("/admin?tab=inventario&page=1");
  }

  let usuarios: UsuarioAdmin[] = [];
  if (!esShopManager) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authError) {
      throw new Error(authError.message);
    }

    const { data: perfiles, error: perfilesError } = await supabaseAdmin
      .from("perfiles_usuarios")
      .select("id, rol, nombre_empresa, rut, datos_onboarding")
      .order("creado_en", { ascending: false });
    if (perfilesError) {
      throw new Error(perfilesError.message);
    }

    const perfilPorId = new Map(
      ((perfiles as PerfilUsuario[]) ?? []).map((perfil) => [perfil.id, perfil]),
    );

    usuarios = (authData?.users ?? []).map((authUser) => {
      const perfil = perfilPorId.get(authUser.id);
      return {
        id: authUser.id,
        email: authUser.email ?? "",
        nombre_empresa: perfil?.nombre_empresa ?? null,
        rut: perfil?.rut ?? null,
        estado: resolverEstado(perfil),
        es_admin: perfil?.rol === "admin",
      };
    });
  }

  let filasCategoriasWoo: FilaCategoriaCache[] = [];
  let analyticsDesde = "";
  let analyticsHasta = "";
  let cargaAnaliticasVentasWeb: CargaAnaliticasVentasWeb | null = null;
  let filasCategoriasAnaliticasVentasWeb: FilaCategoriaCache[] = [];
  let analyticsEtiquetaCategoriaFiltro: string | null = null;
  const subAnalitica = analiticaParam === "mayorista" ? "mayorista" : "ventas-web";

  if (pestanaActiva === "analiticas") {
    const rango = rangoFechasAnaliticas(desdeAnaliticaParam, hastaAnaliticaParam);
    analyticsDesde = rango.desde;
    analyticsHasta = rango.hasta;
    if (subAnalitica === "ventas-web") {
      const { data: datosCatsAnaliticas, error: errorCatsAnaliticas } = await supabaseAdmin
        .from("woo_category_cache")
        .select("woo_term_id, nombre, id_padre")
        .order("nombre", { ascending: true });

      if (errorCatsAnaliticas) {
        const tablaAusente =
          errorCatsAnaliticas.message.includes("Could not find the table") ||
          errorCatsAnaliticas.message.includes("schema cache");
        if (!tablaAusente) {
          throw new Error(errorCatsAnaliticas.message);
        }
        filasCategoriasAnaliticasVentasWeb = [];
      } else {
        filasCategoriasAnaliticasVentasWeb = (datosCatsAnaliticas as FilaCategoriaCache[]) ?? [];
      }

      const idAcategoria = Number.parseInt(String(acategoriaAnaliticaParam), 10);
      let idsCategoriaFiltro: number[] | null = null;
      if (Number.isFinite(idAcategoria) && idAcategoria > 0) {
        idsCategoriaFiltro = idsCategoriaMasDescendientes(
          idAcategoria,
          filasCategoriasAnaliticasVentasWeb,
        );
        const filaSel = filasCategoriasAnaliticasVentasWeb.find(
          (c) => c.woo_term_id === idAcategoria,
        );
        analyticsEtiquetaCategoriaFiltro =
          filaSel?.nombre ?? `Categoría #${idAcategoria}`;
      }

      cargaAnaliticasVentasWeb = await cargarAnaliticasVentasWeb(
        supabaseAdmin,
        rango.desde,
        rango.hasta,
        { idsCategoriaFiltro },
      );
    }
  }

  if (pestanaActiva === "inventario") {
    const { data: datosCategorias, error: errorCategorias } = await supabaseAdmin
      .from("woo_category_cache")
      .select("woo_term_id, nombre, id_padre")
      .order("nombre", { ascending: true });

    if (errorCategorias) {
      throw new Error(errorCategorias.message);
    }

    filasCategoriasWoo = (datosCategorias as FilaCategoriaCache[]) ?? [];
  }

  return (
    <section className="space-y-6">
      <AdminDashboardHeader
        pestanaActiva={pestanaActiva}
        variant={esShopManager ? "operaciones" : "completo"}
      />

      {pestanaActiva === "usuarios" ? (
        <Card className="bg-card">
          <CardHeader className="flex-col items-start gap-2">
            <CardTitle className="text-lg">Usuarios mayoristas</CardTitle>
            <CardDescription>
              Crear, editar y borrar usuarios. Incluye estado pendiente, aprobado y bloqueado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form
              action={crearUsuarioAdminAction}
              className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-5"
            >
              <Input name="email" type="email" required placeholder="Email" />
              <Input name="password" type="password" required placeholder="Password temporal" />
              <Input name="nombre_empresa" placeholder="Nombre empresa" />
              <Input name="rut" placeholder="RUT" />
              <div className="flex items-center gap-2">
                <select
                  name="estado"
                  defaultValue="pendiente"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="aprobado">Aprobado</option>
                  <option value="bloqueado">Bloqueado</option>
                  <option value="admin">Administrador</option>
                  <option value="shop_manager">Encargado tienda (inventario y pedidos)</option>
                </select>
                <Button type="submit">Crear</Button>
              </div>
            </form>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Nombre Empresa</th>
                    <th className="px-4 py-3 text-left font-medium">RUT</th>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario) => (
                    <tr key={usuario.id} className="border-t border-border/80 align-top">
                      <td className="px-4 py-3">
                        <form
                          action={actualizarUsuarioAdminAction}
                          id={`usuario-${usuario.id}`}
                          className="space-y-2"
                        >
                          <input type="hidden" name="id_usuario" value={usuario.id} />
                          <Input
                            name="nombre_empresa"
                            defaultValue={usuario.nombre_empresa ?? ""}
                            placeholder="Nombre empresa"
                            className="max-w-[240px]"
                          />
                        </form>
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          form={`usuario-${usuario.id}`}
                          name="rut"
                          defaultValue={usuario.rut ?? ""}
                          placeholder="RUT"
                          className="max-w-[180px]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          form={`usuario-${usuario.id}`}
                          name="email"
                          type="email"
                          defaultValue={usuario.email}
                          placeholder="Email"
                          className="max-w-[280px]"
                          required
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          form={`usuario-${usuario.id}`}
                          name="estado"
                          defaultValue={usuario.estado}
                          className="h-10 w-full min-w-[160px] max-w-[200px] rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none"
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="aprobado">Aprobado</option>
                          <option value="bloqueado">Bloqueado</option>
                          <option value="admin">Administrador</option>
                          <option value="shop_manager">Encargado tienda</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button form={`usuario-${usuario.id}`} type="submit" size="sm">
                            Guardar
                          </Button>
                          <form action={borrarUsuarioAdminAction}>
                            <input type="hidden" name="id_usuario" value={usuario.id} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="destructive"
                              disabled={
                                usuario.es_admin || usuario.id === idUsuarioSesion
                              }
                            >
                              Borrar
                            </Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : pestanaActiva === "inventario" ? (
        <>
          <Card className="bg-card">
            <CardHeader className="w-full flex-col items-stretch gap-2">
              <CardTitle className="text-lg">Inventario General</CardTitle>
              <CardDescription className="w-full max-w-none">
                Elegí una categoría para ver productos (subcategoría opcional). Podés buscar por nombre, SKU o precio
                exacto. Abrí un producto para editar precios y costos. Importación CSV y sincronización Woo están en
                Herramientas técnicas al final.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense
                fallback={
                  <div className="mb-4 h-40 w-full animate-pulse rounded-md bg-muted/40" aria-hidden />
                }
              >
                <InventarioPanelCliente
                  categorias={filasCategoriasWoo.map((fila) => ({
                    id: fila.woo_term_id,
                    nombre: fila.nombre,
                    idPadre: fila.id_padre,
                  }))}
                />
              </Suspense>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="space-y-6">
          <Card className="bg-card">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg">Analíticas</CardTitle>
                <CardDescription>
                  Métricas en vivo desde WooCommerce; el costo y el margen usan{" "}
                  <span className="text-foreground">precio_costo</span> del inventario mayorista.
                </CardDescription>
              </div>
              <div className="inline-flex shrink-0 rounded-lg border border-border p-1">
                <Link
                  href="/admin?tab=analiticas&analitica=ventas-web"
                  className={`rounded-md px-3 py-2 text-sm ${
                    subAnalitica === "ventas-web"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Ventas Web
                </Link>
                <Link
                  href="/admin?tab=analiticas&analitica=mayorista"
                  className={`rounded-md px-3 py-2 text-sm ${
                    subAnalitica === "mayorista"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Mayorista
                </Link>
              </div>
            </CardHeader>
          </Card>

          {subAnalitica === "mayorista" ? (
            <Card className="bg-card">
              <CardHeader>
                <CardTitle className="text-lg">Analíticas mayorista</CardTitle>
                <CardDescription>
                  Próximamente: pedidos B2B, márgenes del canal mayorista y comparativas.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              <Card className="bg-card">
                <CardHeader className="flex-col items-start gap-2">
                  <CardTitle className="text-lg">Ventas Web</CardTitle>
                  <CardDescription>
                    Ingresos y margen por líneas de producto (costo desde inventario mayorista). Estados Woo, fechas
                    GMT y totales del pedido (envío, reembolsos) están en Herramientas técnicas al final.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AnaliticasVentasWebRangoForm
                    key={`${analyticsDesde}-${analyticsHasta}-${acategoriaAnaliticaParam}`}
                    desdeInicial={analyticsDesde}
                    hastaInicial={analyticsHasta}
                    acategoriaInicial={acategoriaAnaliticaParam}
                    categorias={filasCategoriasAnaliticasVentasWeb}
                  />
                </CardContent>
              </Card>

              {cargaAnaliticasVentasWeb && !cargaAnaliticasVentasWeb.ok ? (
                <Card className="border-destructive/50 bg-card">
                  <CardContent className="pt-6 text-sm text-destructive">
                    {cargaAnaliticasVentasWeb.error}
                  </CardContent>
                </Card>
              ) : null}

              {cargaAnaliticasVentasWeb && cargaAnaliticasVentasWeb.ok ? (
                <AnaliticasVentasWebLazy
                  key={`${analyticsDesde}-${analyticsHasta}-${acategoriaAnaliticaParam}`}
                  datos={cargaAnaliticasVentasWeb.datos}
                  categoriaFiltroEtiqueta={analyticsEtiquetaCategoriaFiltro}
                />
              ) : null}
            </>
          )}
        </div>
      )}

      {pestanaActiva === "inventario" ? (
        <AdminPanelTecnicoDisclosure titulo="Herramientas técnicas (importación, API y sincronización)">
          <ImportadorCostosInventario embebido />
          <InventarioSyncManualFlotante variante="integrado" />
        </AdminPanelTecnicoDisclosure>
      ) : null}

      {pestanaActiva === "analiticas" &&
      subAnalitica === "ventas-web" &&
      cargaAnaliticasVentasWeb &&
      cargaAnaliticasVentasWeb.ok ? (
        <AdminPanelTecnicoDisclosure titulo="Herramientas técnicas (WooCommerce, API y totales del pedido)">
          <AnaliticasVentasWebMetaTecnica
            desde={analyticsDesde}
            hasta={analyticsHasta}
            estadosPedidoWooResumen={estadosPedidoWooAnaliticasResumen()}
            resumen={cargaAnaliticasVentasWeb.datos.resumen}
            categoriaFiltroEtiqueta={analyticsEtiquetaCategoriaFiltro}
          />
        </AdminPanelTecnicoDisclosure>
      ) : null}
    </section>
  );
}
