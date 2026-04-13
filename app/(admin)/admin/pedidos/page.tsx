import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";

import { AdminDashboardHeader } from "@/components/admin/admin-dashboard-header";
import { PedidosAdminContenido } from "@/components/admin/pedidos-admin-contenido";
import { PedidosAdminContenidoSkeleton } from "@/components/admin/pedidos-admin-contenido-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseServidor } from "@/lib/supabase-servidor";

export const dynamic = "force-dynamic";

function parametroTexto(valor: string | string[] | undefined): string | undefined {
  if (valor === undefined) return undefined;
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function AdminPedidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pagina = Math.max(1, Number.parseInt(parametroTexto(sp.pagina) ?? "1", 10) || 1);
  const porPagina = Number.parseInt(parametroTexto(sp.porPagina) ?? "20", 10) || 20;
  const estado = parametroTexto(sp.estado) ?? "";
  const fechaDesde = parametroTexto(sp.desde);
  const fechaHasta = parametroTexto(sp.hasta);
  const claveSuspense = [pagina, porPagina, estado, fechaDesde ?? "", fechaHasta ?? ""].join("|");

  const supabaseServidor = await getSupabaseServidor();
  const {
    data: { user },
  } = await supabaseServidor.auth.getUser();
  const { data: perfilActor } = await supabaseServidor
    .from("perfiles_usuarios")
    .select("rol")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const esShopManager = perfilActor?.rol === "shop_manager";
  const hrefVolverAdmin = esShopManager ? "/admin?tab=inventario&page=1" : "/admin";

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 text-muted-foreground hover:text-foreground">
          <Link href={hrefVolverAdmin} aria-label="Volver al panel de administración">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
        </Button>
        <AdminDashboardHeader
          pestanaActiva="pedidos"
          variant={esShopManager ? "operaciones" : "completo"}
        />
      </div>

      <Card className="bg-card">
        <CardHeader className="w-full flex-col items-stretch gap-2">
          <CardTitle className="text-lg">Pedidos Web</CardTitle>
          <CardDescription className="w-full max-w-none">
            Filtrá por fechas y estado, paginá la lista y abrí un pedido para el detalle, cambiar el estado o WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense key={claveSuspense} fallback={<PedidosAdminContenidoSkeleton />}>
            <PedidosAdminContenido
              pagina={pagina}
              porPagina={porPagina}
              estado={estado}
              fechaDesde={fechaDesde}
              fechaHasta={fechaHasta}
            />
          </Suspense>
        </CardContent>
      </Card>
    </section>
  );
}
