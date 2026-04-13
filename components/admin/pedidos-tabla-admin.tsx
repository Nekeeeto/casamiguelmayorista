"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, MessageCircle, Package, User } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast, Toaster } from "sonner";

import { actualizarEstadoPedido } from "@/actions/pedidos";
import { clasesEstadoPedidoAdmin } from "@/lib/pedidos-admin-estado-estilos";
import type { VistaPedidosAdminMeta } from "@/lib/pedidos-admin-listado";
import {
  PedidosFiltrosPaginacion,
  PedidosNavegacionPaginas,
  PedidosPorPaginaYResumen,
} from "@/components/admin/pedidos-filtros-paginacion";
import { PedidoSheetImprimirEtiqueta } from "@/components/pedidos/PedidoSheet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { esPedidoFlujoPickup, pedidoRequiereEtiquetaEnvio } from "@/lib/pedido-envio-etiqueta";
import { normalizarTelefonoWaUruguay } from "@/lib/telefono-wa-uruguay";
import type { WooDireccionPedido, WooLineItemPedido, WooPedidoAdmin } from "@/lib/woo-pedido-admin-types";
import { cn } from "@/lib/utils";

const OPCIONES_ESTADO: { value: string; label: string }[] = [
  { value: "pending", label: "Pendiente de pago" },
  { value: "proceso-mvd", label: "Proceso MVD" },
  { value: "proceso-interior", label: "Proceso interior" },
  { value: "espera-mvd", label: "En espera MVD" },
  { value: "espera-interior", label: "En espera interior" },
  { value: "espera-pickup", label: "En espera pickup" },
  { value: "proceso-pickup", label: "Proceso pickup" },
  { value: "completed", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
  { value: "refunded", label: "Reembolsado" },
  { value: "failed", label: "Fallido" },
];

/** Pickup en local: solo transición a cierre (el estado actual intermedio se lista para que el Select siga válido). */
const OPCIONES_ESTADO_PICKUP: { value: string; label: string }[] = [
  { value: "completed", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
];

function nombreCliente(p: WooPedidoAdmin) {
  const n = [p.billing?.first_name, p.billing?.last_name].filter(Boolean).join(" ").trim();
  return n || "—";
}

/** Solo nombre de pila para el saludo de WhatsApp (ej. "Pablo", no "Pablo Etcheverry"). */
function nombreSaludoWhatsApp(p: WooPedidoAdmin) {
  const fn = p.billing?.first_name?.trim();
  if (fn) {
    return fn.split(/\s+/)[0] ?? fn;
  }
  const completo = nombreCliente(p);
  if (completo !== "—") {
    return completo.split(/\s+/)[0] ?? completo;
  }
  return "Cliente";
}

function opcionesSelectParaPedido(pedido: WooPedidoAdmin) {
  const status = pedido.status;
  if (esPedidoFlujoPickup(pedido)) {
    const esTerminal = status === "completed" || status === "cancelled";
    if (esTerminal) return OPCIONES_ESTADO_PICKUP;
    const actual = OPCIONES_ESTADO.find((o) => o.value === status);
    return [{ value: status, label: actual?.label ?? status }, ...OPCIONES_ESTADO_PICKUP];
  }

  const valores = new Set(OPCIONES_ESTADO.map((o) => o.value));
  if (valores.has(status)) return OPCIONES_ESTADO;
  return [{ value: status, label: status }, ...OPCIONES_ESTADO];
}

function SelectEstadoPedidoTabla({
  pedido,
  deshabilitado,
  onCambiarEstado,
}: {
  pedido: WooPedidoAdmin;
  deshabilitado: boolean;
  onCambiarEstado: (id: number, estado: string, estadoAnterior: string) => void;
}) {
  const opciones = opcionesSelectParaPedido(pedido);
  return (
    <Select
      value={pedido.status}
      disabled={deshabilitado}
      onValueChange={(v) => onCambiarEstado(pedido.id, v, pedido.status)}
    >
      <SelectTrigger
        className={cn(
          "h-9 min-h-9 w-full max-w-[min(100%,220px)] justify-between gap-1 border px-2.5 text-left text-xs font-medium shadow-sm sm:text-sm",
          clasesEstadoPedidoAdmin(pedido.status),
        )}
        aria-label={`Cambiar estado del pedido ${pedido.number ?? pedido.id}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="z-100">
        {opciones.map((op) => (
          <SelectItem key={op.value} value={op.value}>
            {op.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function direccionEnvioPreferida(p: WooPedidoAdmin): WooDireccionPedido | undefined {
  const s = p.shipping;
  if (s?.address_1?.trim() || s?.city?.trim() || s?.first_name?.trim()) return s;
  return p.billing;
}

function nombreEnvioPreferido(p: WooPedidoAdmin): string {
  const d = direccionEnvioPreferida(p);
  const n = [d?.first_name, d?.last_name].filter(Boolean).join(" ").trim();
  if (n) return n;
  return nombreCliente(p);
}

function telefonoContactoPedido(p: WooPedidoAdmin): string {
  const d = direccionEnvioPreferida(p);
  return d?.phone?.trim() || p.billing?.phone?.trim() || "—";
}

function lineasCallePedido(d: WooDireccionPedido | undefined): string[] {
  if (!d) return [];
  const out: string[] = [];
  if (d.company?.trim()) out.push(d.company.trim());
  if (d.address_1?.trim()) out.push(d.address_1.trim());
  if (d.address_2?.trim()) out.push(d.address_2.trim());
  if (d.postcode?.trim()) out.push(`CP ${d.postcode.trim()}`);
  return out;
}

function ClienteDatosSheet({ pedido }: { pedido: WooPedidoAdmin }) {
  const pickup = esPedidoFlujoPickup(pedido);
  const d = direccionEnvioPreferida(pedido);
  const calle = lineasCallePedido(d);
  const localidad = d?.city?.trim() || "—";
  const departamento = d?.state?.trim() || "—";
  const pais = d?.country?.trim();
  const mostrarPais = Boolean(pais && pais.toUpperCase() !== "UY");

  return (
    <dl className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Nombre</dt>
          <dd className="text-foreground">{nombreEnvioPreferido(pedido)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Teléfono</dt>
          <dd className="tabular-nums text-foreground">{telefonoContactoPedido(pedido)}</dd>
        </div>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">Email</dt>
        <dd className="break-all text-foreground">{pedido.billing?.email || "—"}</dd>
      </div>
      {!pickup ? (
        <>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Dirección (calle)</dt>
            <dd className="text-foreground">
              {calle.length ? (
                <div className="space-y-0.5">
                  {calle.map((linea, i) => (
                    <div key={i}>{linea}</div>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Localidad</dt>
              <dd className="text-foreground">{localidad}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Departamento</dt>
              <dd className="text-foreground">{departamento}</dd>
            </div>
          </div>
          {mostrarPais ? (
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">País</dt>
              <dd className="text-foreground">{pais}</dd>
            </div>
          ) : null}
        </>
      ) : null}
    </dl>
  );
}

function formatearFechaCelda(raw: string | undefined) {
  if (!raw?.trim()) return "—";
  const d = parseISO(raw);
  if (!isValid(d)) return raw;
  try {
    return format(d, "dd/MM/yyyy HH:mm", { locale: es });
  } catch {
    return raw;
  }
}

/** Para la tabla: “hace X minutos / horas / días” (español). */
function formatearFechaRelativa(raw: string | undefined) {
  if (!raw?.trim()) return "—";
  const d = parseISO(raw);
  if (!isValid(d)) return raw;
  try {
    return formatDistanceToNow(d, { locale: es, addSuffix: true });
  } catch {
    return raw;
  }
}

function formatearMonedaSeguro(monto: string, moneda: string | undefined) {
  const codigo = moneda?.trim() && /^[A-Z]{3}$/i.test(moneda.trim()) ? moneda.trim().toUpperCase() : "UYU";
  const n = Number.parseFloat(monto);
  if (!Number.isFinite(n)) return monto;
  try {
    return new Intl.NumberFormat("es-UY", {
      style: "currency",
      currency: codigo,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${codigo} ${Math.round(n)}`;
  }
}

function urlMiniaturaLineItem(item: WooLineItemPedido): string | undefined {
  const src = item.image?.src;
  return typeof src === "string" && src.trim() ? src.trim() : undefined;
}

function MiniaturaProductoLinea({ item }: { item: WooLineItemPedido }) {
  const src = urlMiniaturaLineItem(item);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="size-10 shrink-0 rounded-md border border-border bg-muted object-cover"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  }
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"
      aria-hidden
    >
      <Package className="size-4" />
    </div>
  );
}

function SheetSeccionColapsable({
  titulo,
  icono,
  children,
}: {
  titulo: string;
  icono: ReactNode;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/30"
        aria-expanded={abierto}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted-foreground [&>svg]:size-4" aria-hidden>
            {icono}
          </span>
          <span>{titulo}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            abierto && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {abierto ? <div className="border-t border-border/60 px-4 pb-4 pt-3">{children}</div> : null}
    </div>
  );
}

function construirUrlWhatsApp(p: WooPedidoAdmin) {
  const tel = normalizarTelefonoWaUruguay(p.billing?.phone);
  if (!tel) return null;
  const nombre = nombreSaludoWhatsApp(p);
  const numeroPedido = p.number ?? String(p.id);
  const texto = `Hola ${nombre}, te escribo de Casa Miguel Mayoristas por tu pedido #${numeroPedido}.`;
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

function IconoWhatsApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.074-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c-.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

export function PedidosTablaAdmin({
  pedidosIniciales,
  meta,
}: {
  pedidosIniciales: WooPedidoAdmin[];
  meta: VistaPedidosAdminMeta;
}) {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<WooPedidoAdmin[]>(pedidosIniciales);
  useEffect(() => {
    setPedidos(pedidosIniciales);
  }, [pedidosIniciales]);
  const [abierto, setAbierto] = useState(false);
  const [pedidoActivo, setPedidoActivo] = useState<WooPedidoAdmin | null>(null);
  const [pendienteEstado, startTransition] = useTransition();
  const [pedidoIdActualizandoEstado, setPedidoIdActualizandoEstado] = useState<number | null>(null);

  const aplicarEstadoLocal = useCallback((id: number, status: string) => {
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    setPedidoActivo((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
  }, []);

  const onCambiarEstado = useCallback(
    (id: number, estado: string, estadoAnterior: string) => {
      if (estado === estadoAnterior) return;
      startTransition(async () => {
        setPedidoIdActualizandoEstado(id);
        try {
          const res = await actualizarEstadoPedido(id, estado);
          if (res.ok) {
            aplicarEstadoLocal(id, res.status);
            toast.success("Estado actualizado");
            router.refresh();
          } else {
            toast.error(res.error);
          }
        } finally {
          setPedidoIdActualizandoEstado(null);
        }
      });
    },
    [aplicarEstadoLocal, router],
  );

  const abrirDetalle = useCallback((p: WooPedidoAdmin) => {
    setPedidoActivo(p);
    setAbierto(true);
  }, []);

  const columnas = useMemo<ColumnDef<WooPedidoAdmin>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">#{row.original.number ?? row.original.id}</span>
        ),
      },
      {
        id: "cliente",
        header: "Cliente",
        cell: ({ row }) => <span className="max-w-[200px] truncate">{nombreCliente(row.original)}</span>,
      },
      {
        id: "fecha",
        header: "Hace",
        cell: ({ row }) => {
          const raw = row.original.date_created || row.original.date_created_gmt;
          const detalle = formatearFechaCelda(raw);
          return (
            <span
              className="whitespace-nowrap text-muted-foreground"
              title={detalle !== "—" ? detalle : undefined}
            >
              {formatearFechaRelativa(raw)}
            </span>
          );
        },
      },
      {
        id: "total",
        header: "Total",
        cell: ({ row }) => (
          <span className="tabular-nums">{formatearMonedaSeguro(row.original.total, row.original.currency)}</span>
        ),
      },
      {
        id: "estado",
        header: "Estado",
        cell: ({ row }) => (
          <div className="min-w-0 max-w-[min(100%,240px)] py-0.5">
            <SelectEstadoPedidoTabla
              pedido={row.original}
              deshabilitado={pedidoIdActualizandoEstado === row.original.id}
              onCambiarEstado={onCambiarEstado}
            />
          </div>
        ),
      },
      {
        id: "acciones",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => {
          const p = row.original;
          const urlWa = construirUrlWhatsApp(p);
          return (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => abrirDetalle(p)}>
                Ver detalle
              </Button>
              {urlWa ? (
                <Button
                  asChild
                  size="icon"
                  variant="outline"
                  className="size-8 shrink-0 border-[#25D366]/50 text-[#25D366] hover:bg-[#25D366]/12 hover:text-[#128C7E]"
                  title="WhatsApp al cliente"
                >
                  <a href={urlWa} target="_blank" rel="noopener noreferrer" aria-label="Enviar WhatsApp al cliente">
                    <IconoWhatsApp className="size-4.5" />
                  </a>
                </Button>
              ) : null}
              {pedidoRequiereEtiquetaEnvio(p) ? <PedidoSheetImprimirEtiqueta pedido={p} soloIcono /> : null}
            </div>
          );
        },
      },
    ],
    [abrirDetalle, onCambiarEstado, pedidoIdActualizandoEstado],
  );

  const tabla = useReactTable({
    data: pedidos,
    columns: columnas,
    getCoreRowModel: getCoreRowModel(),
  });

  const opcionesSelectSheet = useMemo(
    () => (pedidoActivo ? opcionesSelectParaPedido(pedidoActivo) : OPCIONES_ESTADO),
    [pedidoActivo],
  );

  const urlWa = pedidoActivo ? construirUrlWhatsApp(pedidoActivo) : null;

  return (
    <>
      <PedidosFiltrosPaginacion
        desde={meta.fechaDesde}
        hasta={meta.fechaHasta}
        estado={meta.estado}
        pagina={meta.pagina}
        porPagina={meta.porPagina}
        conteosPorEstado={meta.conteosPorEstado}
      />

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            {tabla.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className={header.column.id === "acciones" ? "text-right" : undefined}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {tabla.getRowModel().rows.length ? (
              tabla.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columnas.length} className="h-24 text-center text-muted-foreground">
                  No hay pedidos para mostrar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 space-y-4 border-t border-border pt-4">
        <PedidosPorPaginaYResumen
          desde={meta.fechaDesde}
          hasta={meta.fechaHasta}
          estado={meta.estado}
          pagina={meta.pagina}
          porPagina={meta.porPagina}
          total={meta.total}
        />
        <PedidosNavegacionPaginas
          desde={meta.fechaDesde}
          hasta={meta.fechaHasta}
          estado={meta.estado}
          pagina={meta.pagina}
          porPagina={meta.porPagina}
          totalPaginas={meta.totalPaginas}
        />
      </div>

      <Sheet
        open={abierto}
        onOpenChange={(open) => {
          setAbierto(open);
          if (!open) {
            setPedidoActivo(null);
          }
        }}
      >
        <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-xl md:max-w-2xl lg:max-w-4xl">
          {pedidoActivo ? (
            <>
              <SheetHeader className="shrink-0 space-y-4 border-b-0">
                <div>
                  <SheetTitle>Pedido #{pedidoActivo.number ?? pedidoActivo.id}</SheetTitle>
                  <SheetDescription className="mt-1">Cliente y productos del pedido en WooCommerce.</SheetDescription>
                  <p className="mt-2 text-sm text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wide">Fecha del pedido</span>
                    <span className="ml-2 text-foreground">
                      {formatearFechaCelda(pedidoActivo.date_created || pedidoActivo.date_created_gmt)}
                    </span>
                  </p>
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado del pedido</span>
                  <Select
                    value={pedidoActivo.status}
                    disabled={
                      pendienteEstado || pedidoIdActualizandoEstado === pedidoActivo.id
                    }
                    onValueChange={(v) => onCambiarEstado(pedidoActivo.id, v, pedidoActivo.status)}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-12 w-full text-base font-medium",
                        "border-input bg-background shadow-sm",
                      )}
                      aria-label="Cambiar estado del pedido"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-60">
                      {opcionesSelectSheet.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="min-w-0">
                    {urlWa ? (
                      <Button
                        asChild
                        className="w-full bg-green-600 text-white hover:bg-green-700"
                        size="default"
                      >
                        <a href={urlWa} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="mr-2 size-4 shrink-0" aria-hidden />
                          Enviar WhatsApp
                        </a>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="default"
                        disabled
                        className="w-full text-muted-foreground"
                      >
                        <MessageCircle className="mr-2 size-4 shrink-0 opacity-50" aria-hidden />
                        Sin teléfono
                      </Button>
                    )}
                  </div>
                  <div className="min-w-0">
                    {pedidoRequiereEtiquetaEnvio(pedidoActivo) ? (
                      <PedidoSheetImprimirEtiqueta pedido={pedidoActivo} className="w-full" />
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="default"
                        disabled
                        className="w-full text-muted-foreground"
                      >
                        Sin etiqueta de envío
                      </Button>
                    )}
                  </div>
                </div>
              </SheetHeader>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6 pt-2">
                <SheetSeccionColapsable
                  key={`sheet-cli-${pedidoActivo.id}`}
                  titulo="Cliente"
                  icono={<User />}
                >
                  <ClienteDatosSheet pedido={pedidoActivo} />
                </SheetSeccionColapsable>

                <SheetSeccionColapsable
                  key={`sheet-prod-${pedidoActivo.id}`}
                  titulo="Productos"
                  icono={<Package />}
                >
                  <div className="overflow-x-auto rounded-md border border-border">
                    <Table className="min-w-[520px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-48">Producto</TableHead>
                          <TableHead className="w-20 whitespace-nowrap text-right">Cant.</TableHead>
                          <TableHead className="w-32 whitespace-nowrap text-right">Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pedidoActivo.line_items?.length ? (
                          pedidoActivo.line_items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="min-w-0 align-middle">
                                <div className="flex min-w-0 items-center gap-3">
                                  <MiniaturaProductoLinea item={item} />
                                  <span className="min-w-0 truncate font-medium">{item.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{item.quantity}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatearMonedaSeguro(item.subtotal, pedidoActivo.currency)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              Sin líneas de producto.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </SheetSeccionColapsable>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Toaster theme="dark" richColors position="top-center" closeButton />
    </>
  );
}
