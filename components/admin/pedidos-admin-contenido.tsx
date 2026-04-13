import { listarPedidosAdmin } from "@/actions/pedidos";
import { PedidosTablaAdminLoader } from "@/components/admin/pedidos-tabla-admin-loader";

export async function PedidosAdminContenido({
  pagina,
  porPagina,
  estado,
  fechaDesde,
  fechaHasta,
}: {
  pagina: number;
  porPagina: number;
  estado: string;
  fechaDesde?: string;
  fechaHasta?: string;
}) {
  const resultado = await listarPedidosAdmin({
    fechaDesde,
    fechaHasta,
    estado,
    pagina,
    porPagina,
  });

  if (!resultado.ok) {
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {resultado.error}
      </p>
    );
  }

  return (
    <PedidosTablaAdminLoader
      pedidosIniciales={resultado.pedidos}
      meta={{
        total: resultado.total,
        totalPaginas: resultado.totalPaginas,
        pagina: resultado.pagina,
        porPagina: resultado.porPagina,
        fechaDesde: resultado.fechaDesde,
        fechaHasta: resultado.fechaHasta,
        estado: resultado.estado,
        conteosPorEstado: resultado.conteosPorEstado,
      }}
    />
  );
}
