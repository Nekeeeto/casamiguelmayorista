"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  FileText,
  Filter,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserX,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseCsvConEncabezados } from "@/lib/csv-utils";
import { formatearTelefonoParaUi } from "@/lib/telefono-wa-uruguay";
import {
  detectarMapeoContactosCsv,
  type MapeoColumnasContacto,
} from "@/lib/whatsapp-contactos-csv";
import { WhatsappContactoDialog, type ContactoFormularioDatos } from "@/components/admin/whatsapp-contacto-dialog";

type Contacto = {
  id: string;
  nombre: string;
  telefono: string;
  tags: string[];
  notas: string;
  fecha_creacion: string;
  ultimo_mensaje: string | null;
  opted_out: boolean;
  opted_out_at: string | null;
  avatar_url?: string | null;
};

type FiltroPreset = { id: string; nombre: string; tags: string[] };

const PRESETS_STORAGE_KEY = "wa_mayoristas_contact_list_presets_v1";

function inicialesContacto(nombre: string, telefono: string): string {
  const n = nombre.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0]?.[0];
      const b = parts[1]?.[0];
      if (a && b) return (a + b).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const d = telefono.replace(/\D/g, "");
  return d.slice(-2).toUpperCase() || "?";
}

function AvatarContacto({
  nombre,
  telefono,
  url,
}: Readonly<{ nombre: string; telefono: string; url: string | null }>) {
  const ini = inicialesContacto(nombre, telefono);
  if (url && /^https:\/\//i.test(url)) {
    return (
      <img src={url} alt="" className="size-9 shrink-0 rounded-full object-cover ring-1 ring-border" />
    );
  }
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-foreground"
      aria-hidden
    >
      {ini}
    </div>
  );
}

type OrdenCol = "nombre" | "fecha_creacion" | "ultimo_mensaje";
type Direccion = "asc" | "desc";
type OptOutFiltro = "todos" | "activos" | "baja";

const OMIT_COL = "__omit__";

function mapeoContactoListo(m: Partial<MapeoColumnasContacto>): MapeoColumnasContacto | null {
  if (m.telefono === undefined) return null;
  const o: MapeoColumnasContacto = { telefono: m.telefono };
  if (m.nombre !== undefined) o.nombre = m.nombre;
  if (m.firstName !== undefined) o.firstName = m.firstName;
  if (m.lastName !== undefined) o.lastName = m.lastName;
  if (m.tags !== undefined) o.tags = m.tags;
  if (m.notas !== undefined) o.notas = m.notas;
  if (m.status !== undefined) o.status = m.status;
  if (m.listName !== undefined) o.listName = m.listName;
  return o;
}

export function WhatsappContactosTab() {
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [tagsDisponibles, setTagsDisponibles] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [tagsSeleccionadas, setTagsSeleccionadas] = useState<string[]>([]);
  const [optOut, setOptOut] = useState<OptOutFiltro>("todos");
  const [orden, setOrden] = useState<OrdenCol>("fecha_creacion");
  const [direccion, setDireccion] = useState<Direccion>("desc");
  const [dialogAlta, setDialogAlta] = useState(false);
  const [enEdicion, setEnEdicion] = useState<Contacto | null>(null);
  const [dialogImport, setDialogImport] = useState(false);
  const [csvTexto, setCsvTexto] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<{
    creados: number;
    duplicados: number;
    invalidos: { fila: number; motivo: string }[];
  } | null>(null);
  const [encabezadosImport, setEncabezadosImport] = useState<string[]>([]);
  const [mapeoColumnas, setMapeoColumnas] = useState<Partial<MapeoColumnasContacto>>({});
  const [confirmarBorrar, setConfirmarBorrar] = useState<Contacto | null>(null);
  const [operando, setOperando] = useState<string | null>(null);
  const [presetsFiltro, setPresetsFiltro] = useState<FiltroPreset[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (busqueda.trim()) params.set("q", busqueda.trim());
      if (tagsSeleccionadas.length > 0) params.set("tags", tagsSeleccionadas.join(","));
      params.set("orden", orden);
      params.set("direccion", direccion);
      if (optOut !== "todos") params.set("optOut", optOut);
      const res = await fetch(`/api/admin/whatsapp/contactos?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { contactos: Contacto[] };
      setContactos(data.contactos);
    } catch (error) {
      toast.error("No se pudieron cargar los contactos.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCargando(false);
    }
  }, [busqueda, direccion, optOut, orden, tagsSeleccionadas]);

  const cargarTags = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/contactos/tags", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { tags: string[] };
      setTagsDisponibles(data.tags);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void cargar(), 200);
    return () => clearTimeout(id);
  }, [cargar]);

  useEffect(() => {
    void cargarTags();
  }, [cargarTags]);

  useEffect(() => {
    try {
      const raw = globalThis.localStorage?.getItem(PRESETS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const next: FiltroPreset[] = [];
      for (const row of parsed) {
        if (!row || typeof row !== "object") continue;
        const r = row as { id?: string; nombre?: string; tags?: string[] };
        if (typeof r.nombre !== "string" || !Array.isArray(r.tags)) continue;
        next.push({ id: typeof r.id === "string" ? r.id : crypto.randomUUID(), nombre: r.nombre, tags: r.tags });
      }
      setPresetsFiltro(next);
    } catch {
      // ignore
    }
  }, []);

  const persistirPresets = useCallback((next: FiltroPreset[]) => {
    setPresetsFiltro(next);
    try {
      globalThis.localStorage?.setItem(PRESETS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const guardarPresetFiltro = useCallback(() => {
    const nombre = globalThis.prompt?.("Nombre de la lista (tags actuales)")?.trim();
    if (!nombre) return;
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    persistirPresets([...presetsFiltro, { id, nombre, tags: [...tagsSeleccionadas] }]);
  }, [persistirPresets, presetsFiltro, tagsSeleccionadas]);

  useEffect(() => {
    if (!dialogImport || !csvTexto.trim()) {
      setEncabezadosImport([]);
      setMapeoColumnas({});
      return;
    }
    const { encabezados } = parseCsvConEncabezados(csvTexto);
    setEncabezadosImport(encabezados);
    const detectado = detectarMapeoContactosCsv(encabezados);
    setMapeoColumnas(detectado ?? {});
  }, [dialogImport, csvTexto]);

  const cambiarOrden = (columna: OrdenCol) => {
    if (orden === columna) {
      setDireccion((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrden(columna);
      setDireccion("asc");
    }
  };

  const iconoOrden = (columna: OrdenCol) =>
    orden !== columna ? (
      <ArrowUpDown className="size-3 opacity-60" />
    ) : direccion === "asc" ? (
      <ArrowUp className="size-3" />
    ) : (
      <ArrowDown className="size-3" />
    );

  const importar = async () => {
    const mapEnv = mapeoContactoListo(mapeoColumnas);
    if (!mapEnv) {
      toast.error("Elegí la columna de teléfono.");
      return;
    }
    setImportando(true);
    setResultadoImport(null);
    try {
      const res = await fetch("/api/admin/whatsapp/contactos/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvTexto, mapeo: mapEnv }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      const resumen = (await res.json()) as { creados: number; duplicados: number; invalidos: { fila: number; motivo: string }[] };
      setResultadoImport(resumen);
      toast.success(`Import: ${resumen.creados} nuevos, ${resumen.duplicados} duplicados, ${resumen.invalidos.length} inválidos.`);
      await cargar();
      await cargarTags();
    } catch (error) {
      toast.error("Error al importar.", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setImportando(false);
    }
  };

  const onArchivoCsv = (archivo: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const texto = typeof reader.result === "string" ? reader.result : "";
      setCsvTexto(texto);
    };
    reader.readAsText(archivo);
  };

  const borrar = async () => {
    if (!confirmarBorrar) return;
    setOperando(confirmarBorrar.id);
    try {
      const res = await fetch(`/api/admin/whatsapp/contactos/${encodeURIComponent(confirmarBorrar.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Contacto eliminado.");
      setConfirmarBorrar(null);
      await cargar();
    } catch (error) {
      toast.error("No se pudo eliminar.", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setOperando(null);
    }
  };

  const toggleOptOut = async (contacto: Contacto) => {
    setOperando(contacto.id);
    try {
      const res = await fetch(`/api/admin/whatsapp/contactos/${encodeURIComponent(contacto.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opted_out: !contacto.opted_out }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(contacto.opted_out ? "Contacto reactivado." : "Contacto dado de baja.");
      await cargar();
    } catch (error) {
      toast.error("No se pudo actualizar.", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setOperando(null);
    }
  };

  const datosEdicion: ContactoFormularioDatos | undefined = enEdicion
    ? {
        id: enEdicion.id,
        nombre: enEdicion.nombre,
        telefono: enEdicion.telefono,
        tags: enEdicion.tags,
        notas: enEdicion.notas,
        avatar_url: enEdicion.avatar_url ?? null,
      }
    : undefined;

  const totalActivos = useMemo(() => contactos.filter((c) => !c.opted_out).length, [contactos]);

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Contactos ({contactos.length} — {totalActivos} activos)</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setDialogAlta(true)}>
            <Plus className="size-4" /> Agregar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialogImport(true)}>
            <Upload className="size-4" /> Importar CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              className="pl-8"
              placeholder="Buscar por nombre o teléfono…"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="size-4" />
                Tags {tagsSeleccionadas.length > 0 ? `(${tagsSeleccionadas.length})` : ""}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="max-h-80 w-64 overflow-y-auto">
              {tagsDisponibles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin tags registradas.</p>
              ) : (
                <div className="space-y-2">
                  {tagsDisponibles.map((tag) => {
                    const activa = tagsSeleccionadas.includes(tag);
                    return (
                      <label key={tag} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={activa}
                          onCheckedChange={(checked) => {
                            setTagsSeleccionadas((prev) =>
                              checked ? [...prev, tag] : prev.filter((t) => t !== tag),
                            );
                          }}
                        />
                        {tag}
                      </label>
                    );
                  })}
                  {tagsSeleccionadas.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTagsSeleccionadas([])}
                    >
                      Limpiar
                    </Button>
                  ) : null}
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Select value={optOut} onValueChange={(v) => setOptOut(v as OptOutFiltro)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="activos">Activos</SelectItem>
              <SelectItem value="baja">Dados de baja</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={guardarPresetFiltro}>
            Guardar lista (tags)
          </Button>
        </div>
        {presetsFiltro.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Listas:</span>
            {presetsFiltro.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1">
                <Button type="button" variant="secondary" size="sm" onClick={() => setTagsSeleccionadas([...p.tags])}>
                  {p.nombre}
                  {p.tags.length ? ` (${p.tags.length})` : ""}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1 text-muted-foreground"
                  onClick={() => persistirPresets(presetsFiltro.filter((x) => x.id !== p.id))}
                  aria-label={`Eliminar preset ${p.nombre}`}
                >
                  ×
                </Button>
              </span>
            ))}
          </div>
        ) : null}

        {cargando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando…
          </div>
        ) : contactos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay contactos con ese filtro.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
                    onClick={() => cambiarOrden("nombre")}
                  >
                    Nombre {iconoOrden("nombre")}
                  </button>
                </TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
                    onClick={() => cambiarOrden("fecha_creacion")}
                  >
                    Alta {iconoOrden("fecha_creacion")}
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
                    onClick={() => cambiarOrden("ultimo_mensaje")}
                  >
                    Último mensaje {iconoOrden("ultimo_mensaje")}
                  </button>
                </TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-32">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contactos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <AvatarContacto
                        nombre={c.nombre}
                        telefono={c.telefono}
                        url={c.avatar_url ?? null}
                      />
                      <span className="font-medium">{c.nombre || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{formatearTelefonoParaUi(c.telefono)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(c.fecha_creacion).toLocaleDateString("es-UY")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.ultimo_mensaje ? new Date(c.ultimo_mensaje).toLocaleDateString("es-UY") : "—"}
                  </TableCell>
                  <TableCell>
                    {c.opted_out ? (
                      <Badge variante="destructive">Baja</Badge>
                    ) : (
                      <Badge variante="success">Activo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEnEdicion(c)}
                        title="Editar"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void toggleOptOut(c)}
                        disabled={operando === c.id}
                        title={c.opted_out ? "Reactivar" : "Dar de baja"}
                      >
                        {c.opted_out ? <CheckCircle2 className="size-4" /> : <UserX className="size-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmarBorrar(c)}
                        title="Eliminar"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <WhatsappContactoDialog
        abierto={dialogAlta}
        onAbiertoChange={setDialogAlta}
        tagsSugeridos={tagsDisponibles}
        onGuardado={() => {
          void cargar();
          void cargarTags();
        }}
      />

      <WhatsappContactoDialog
        abierto={Boolean(enEdicion)}
        onAbiertoChange={(abierto) => !abierto && setEnEdicion(null)}
        inicial={datosEdicion}
        tagsSugeridos={tagsDisponibles}
        onGuardado={() => {
          setEnEdicion(null);
          void cargar();
          void cargarTags();
        }}
      />

      <Dialog open={dialogImport} onOpenChange={setDialogImport}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar contactos desde CSV</DialogTitle>
            <DialogDescription>
              Detectamos columnas tipo WANotifier (<code>WhatsApp Number</code>, <code>First Name</code> /{" "}
              <code>Last Name</code>, <code>Status</code>, etc.). Si el archivo es distinto, mapeá cada campo abajo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="wa-csv-file">Archivo CSV</Label>
              <Input
                id="wa-csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const f = event.target.files?.[0];
                  if (f) onArchivoCsv(f);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-csv-texto">…o pegá el contenido:</Label>
              <Textarea
                id="wa-csv-texto"
                rows={6}
                value={csvTexto}
                onChange={(event) => setCsvTexto(event.target.value)}
                placeholder="Primera fila = encabezados. Ej. export WANotifier o nombre,telefono,tags"
              />
            </div>
            {encabezadosImport.length > 0 ? (
              <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium">Mapeo de columnas</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Teléfono *</Label>
                    <Select
                      value={mapeoColumnas.telefono !== undefined ? String(mapeoColumnas.telefono) : undefined}
                      onValueChange={(v) =>
                        setMapeoColumnas((prev) => ({ ...prev, telefono: Number(v) }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Elegí la columna" />
                      </SelectTrigger>
                      <SelectContent>
                        {encabezadosImport.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `Columna ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nombre (una columna)</Label>
                    <Select
                      value={
                        mapeoColumnas.nombre !== undefined ? String(mapeoColumnas.nombre) : OMIT_COL
                      }
                      onValueChange={(v) =>
                        setMapeoColumnas((prev) => ({
                          ...prev,
                          nombre: v === OMIT_COL ? undefined : Number(v),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OMIT_COL}>— omitir —</SelectItem>
                        {encabezadosImport.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `Columna ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>First name</Label>
                    <Select
                      value={
                        mapeoColumnas.firstName !== undefined ? String(mapeoColumnas.firstName) : OMIT_COL
                      }
                      onValueChange={(v) =>
                        setMapeoColumnas((prev) => ({
                          ...prev,
                          firstName: v === OMIT_COL ? undefined : Number(v),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OMIT_COL}>— omitir —</SelectItem>
                        {encabezadosImport.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `Columna ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last name</Label>
                    <Select
                      value={
                        mapeoColumnas.lastName !== undefined ? String(mapeoColumnas.lastName) : OMIT_COL
                      }
                      onValueChange={(v) =>
                        setMapeoColumnas((prev) => ({
                          ...prev,
                          lastName: v === OMIT_COL ? undefined : Number(v),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OMIT_COL}>— omitir —</SelectItem>
                        {encabezadosImport.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `Columna ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tags</Label>
                    <Select
                      value={mapeoColumnas.tags !== undefined ? String(mapeoColumnas.tags) : OMIT_COL}
                      onValueChange={(v) =>
                        setMapeoColumnas((prev) => ({
                          ...prev,
                          tags: v === OMIT_COL ? undefined : Number(v),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OMIT_COL}>— omitir —</SelectItem>
                        {encabezadosImport.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `Columna ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lista (se agrega como tag)</Label>
                    <Select
                      value={
                        mapeoColumnas.listName !== undefined ? String(mapeoColumnas.listName) : OMIT_COL
                      }
                      onValueChange={(v) =>
                        setMapeoColumnas((prev) => ({
                          ...prev,
                          listName: v === OMIT_COL ? undefined : Number(v),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OMIT_COL}>— omitir —</SelectItem>
                        {encabezadosImport.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `Columna ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notas</Label>
                    <Select
                      value={mapeoColumnas.notas !== undefined ? String(mapeoColumnas.notas) : OMIT_COL}
                      onValueChange={(v) =>
                        setMapeoColumnas((prev) => ({
                          ...prev,
                          notas: v === OMIT_COL ? undefined : Number(v),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OMIT_COL}>— omitir —</SelectItem>
                        {encabezadosImport.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `Columna ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Estado → baja (ej. unsubscribed)</Label>
                    <Select
                      value={mapeoColumnas.status !== undefined ? String(mapeoColumnas.status) : OMIT_COL}
                      onValueChange={(v) =>
                        setMapeoColumnas((prev) => ({
                          ...prev,
                          status: v === OMIT_COL ? undefined : Number(v),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OMIT_COL}>— omitir —</SelectItem>
                        {encabezadosImport.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `Columna ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Si definís «Nombre» y también First/Last, se usa «Nombre». «unsubscribed» marca opt-out al importar.
                </p>
              </div>
            ) : null}
            {resultadoImport ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <p>
                  Creados: <strong>{resultadoImport.creados}</strong> · Duplicados:{" "}
                  <strong>{resultadoImport.duplicados}</strong> · Inválidos:{" "}
                  <strong>{resultadoImport.invalidos.length}</strong>
                </p>
                {resultadoImport.invalidos.length > 0 ? (
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {resultadoImport.invalidos.slice(0, 20).map((i, idx) => (
                      <li key={idx}>
                        Fila {i.fila}: {i.motivo}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogImport(false)} disabled={importando}>
              Cerrar
            </Button>
            <Button
              onClick={() => void importar()}
              disabled={importando || !csvTexto.trim() || mapeoColumnas.telefono === undefined}
            >
              {importando ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmarBorrar)} onOpenChange={(abierto) => !abierto && setConfirmarBorrar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar contacto</DialogTitle>
            <DialogDescription>
              Se va a eliminar <strong>{confirmarBorrar?.nombre || confirmarBorrar?.telefono}</strong>. No se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarBorrar(null)} disabled={operando !== null}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void borrar()} disabled={operando !== null}>
              {operando ? <Loader2 className="size-4 animate-spin" /> : null}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
