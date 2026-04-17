"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  CheckCheck,
  Clock,
  Loader2,
  RefreshCw,
  Send,
  UserPlus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WhatsappContactoDialog } from "@/components/admin/whatsapp-contacto-dialog";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { formatearTelefonoParaUi } from "@/lib/telefono-wa-uruguay";
import { cn } from "@/lib/utils";

type Mensaje = {
  id: string;
  direction: "in" | "out";
  from_phone: string;
  to_phone: string;
  body: string;
  media_type: string | null;
  media_url: string | null;
  status: "sent" | "delivered" | "read" | "failed" | "received";
  error: string | null;
  sent_at: string | null;
  received_at: string;
  wa_message_id: string | null;
};

type ConversacionResumen = {
  telefono: string;
  nombre: string | null;
  contactId: string | null;
  optedOut: boolean;
  ultimo: {
    body: string;
    direction: "in" | "out";
    received_at: string;
    status: string;
  };
  entrantesNoLeidos: number;
};

function formatearDuracionRestante(ms: number): string {
  if (ms <= 0) return "Cerrada";
  const totalMin = Math.floor(ms / 60000);
  const hs = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hs > 0) return `${hs}h ${min}m`;
  return `${min}m`;
}

function IconoEstado({ status }: { status: Mensaje["status"] }) {
  if (status === "read") return <CheckCheck className="size-3 text-primary" />;
  if (status === "delivered") return <CheckCheck className="size-3 text-muted-foreground" />;
  if (status === "sent") return <Check className="size-3 text-muted-foreground" />;
  if (status === "failed") return <span className="text-xs text-destructive">✕</span>;
  return null;
}

export function WhatsappBandejaTab() {
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [cargandoInbox, setCargandoInbox] = useState(true);
  const [telefonoActivo, setTelefonoActivo] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargandoMensajes, setCargandoMensajes] = useState(false);
  const [ventanaAbierta, setVentanaAbierta] = useState(false);
  const [ventanaCierraEn, setVentanaCierraEn] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  const [dialogAltaAbierto, setDialogAltaAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const hiloRef = useRef<HTMLDivElement | null>(null);

  const cargarInbox = useCallback(async () => {
    setCargandoInbox(true);
    try {
      const res = await fetch("/api/admin/whatsapp/messages/inbox", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { conversaciones: ConversacionResumen[] };
      setConversaciones(data.conversaciones);
    } catch (error) {
      toast.error("No se pudo cargar la bandeja.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCargandoInbox(false);
    }
  }, []);

  const cargarHilo = useCallback(async (telefono: string) => {
    setCargandoMensajes(true);
    try {
      const res = await fetch(`/api/admin/whatsapp/messages?phone=${encodeURIComponent(telefono)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        mensajes: Mensaje[];
        ventanaAbierta: boolean;
        ventanaCierraEn: string | null;
      };
      setMensajes(data.mensajes);
      setVentanaAbierta(data.ventanaAbierta);
      setVentanaCierraEn(data.ventanaCierraEn);
    } catch (error) {
      toast.error("No se pudo cargar la conversación.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCargandoMensajes(false);
    }
  }, []);

  useEffect(() => {
    void cargarInbox();
  }, [cargarInbox]);

  useEffect(() => {
    if (!telefonoActivo) return;
    void cargarHilo(telefonoActivo);
  }, [cargarHilo, telefonoActivo]);

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowser();
    const canal = supabase
      .channel("whatsapp_messages_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        () => {
          if (cancelled) return;
          void cargarInbox();
          if (telefonoActivo) void cargarHilo(telefonoActivo);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(canal);
    };
  }, [cargarHilo, cargarInbox, telefonoActivo]);

  useEffect(() => {
    if (hiloRef.current) {
      hiloRef.current.scrollTop = hiloRef.current.scrollHeight;
    }
  }, [mensajes]);

  const conversacionActiva = useMemo(
    () => conversaciones.find((c) => c.telefono === telefonoActivo) ?? null,
    [conversaciones, telefonoActivo],
  );

  const msRestantes = ventanaCierraEn ? new Date(ventanaCierraEn).getTime() - ahora : 0;

  const conversacionesFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return conversaciones;
    return conversaciones.filter(
      (c) => c.telefono.includes(q) || (c.nombre ?? "").toLowerCase().includes(q),
    );
  }, [busqueda, conversaciones]);

  const enviar = async () => {
    if (!telefonoActivo || !texto.trim()) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: telefonoActivo, text: texto.trim() }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      setTexto("");
      await cargarHilo(telefonoActivo);
      await cargarInbox();
    } catch (error) {
      toast.error("No se pudo enviar.", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <Card className="max-h-144 overflow-hidden">
        <CardHeader className="flex-col items-stretch gap-2">
          <div className="flex items-center justify-between">
            <CardTitle>Bandeja</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => void cargarInbox()} title="Refrescar">
              {cargandoInbox ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
          </div>
          <Input
            placeholder="Buscar…"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
          />
        </CardHeader>
        <CardContent className="overflow-y-auto p-0">
          {conversacionesFiltradas.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {cargandoInbox ? "Cargando…" : "Sin conversaciones."}
            </p>
          ) : (
            <ul>
              {conversacionesFiltradas.map((c) => {
                const activa = c.telefono === telefonoActivo;
                return (
                  <li key={c.telefono}>
                    <button
                      type="button"
                      onClick={() => setTelefonoActivo(c.telefono)}
                      className={cn(
                        "flex w-full flex-col gap-1 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-accent",
                        activa && "bg-accent/50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {c.nombre || formatearTelefonoParaUi(c.telefono)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(c.ultimo.received_at).toLocaleDateString("es-UY")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                          {c.ultimo.direction === "out" ? "Vos: " : ""}
                          {c.ultimo.body || "—"}
                        </span>
                        <div className="flex items-center gap-1">
                          {c.entrantesNoLeidos > 0 ? (
                            <Badge variante="success">{c.entrantesNoLeidos}</Badge>
                          ) : null}
                          {c.optedOut ? <Badge variante="destructive">Baja</Badge> : null}
                          {!c.contactId ? <Badge variante="warning">Desconocido</Badge> : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="flex max-h-144 flex-col">
        {conversacionActiva ? (
          <>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 border-b border-border/60">
              <div>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {conversacionActiva.nombre || formatearTelefonoParaUi(conversacionActiva.telefono)}
                  {conversacionActiva.optedOut ? <Badge variante="destructive">Baja</Badge> : null}
                  {!conversacionActiva.contactId ? <Badge variante="warning">Desconocido</Badge> : null}
                </CardTitle>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {formatearTelefonoParaUi(conversacionActiva.telefono)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {ventanaAbierta && msRestantes > 0 ? (
                  <Badge variante="success">
                    <Clock className="mr-1 size-3" />
                    Ventana abre por {formatearDuracionRestante(msRestantes)}
                  </Badge>
                ) : (
                  <Badge variante="warning">
                    <Clock className="mr-1 size-3" />
                    Ventana cerrada
                  </Badge>
                )}
                {!conversacionActiva.contactId ? (
                  <Button size="sm" variant="outline" onClick={() => setDialogAltaAbierto(true)}>
                    <UserPlus className="size-4" /> Guardar contacto
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
              <div ref={hiloRef} className="flex-1 space-y-2 overflow-y-auto pr-2">
                {cargandoMensajes ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Cargando…
                  </div>
                ) : (
                  mensajes.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "flex",
                        m.direction === "in" ? "justify-start" : "justify-end",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                          m.direction === "in"
                            ? "bg-muted text-foreground"
                            : "bg-primary/90 text-primary-foreground",
                        )}
                      >
                        {m.media_type ? (
                          <p className="text-xs uppercase opacity-80">[{m.media_type}]</p>
                        ) : null}
                        <p className="whitespace-pre-wrap">{m.body || (m.media_type ? "(sin texto)" : "")}</p>
                        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80">
                          <span>
                            {new Date(m.sent_at ?? m.received_at).toLocaleString("es-UY", {
                              hour: "2-digit",
                              minute: "2-digit",
                              day: "2-digit",
                              month: "2-digit",
                            })}
                          </span>
                          {m.direction === "out" ? <IconoEstado status={m.status} /> : null}
                        </div>
                        {m.error ? <p className="mt-1 text-[10px] text-destructive-foreground/90">{m.error}</p> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-2 border-t border-border/60 pt-3">
                <Textarea
                  value={texto}
                  onChange={(event) => setTexto(event.target.value)}
                  placeholder={
                    ventanaAbierta
                      ? "Escribí tu respuesta…"
                      : "Ventana de 24hs cerrada — usá un template desde Broadcast."
                  }
                  rows={2}
                  disabled={!ventanaAbierta || enviando}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void enviar();
                    }
                  }}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    onClick={() => void enviar()}
                    disabled={!ventanaAbierta || enviando || !texto.trim()}
                  >
                    {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Enviar
                  </Button>
                </div>
              </div>
            </CardContent>
          </>
        ) : (
          <CardContent className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground">
            Seleccioná una conversación.
          </CardContent>
        )}
      </Card>

      {conversacionActiva ? (
        <WhatsappContactoDialog
          abierto={dialogAltaAbierto}
          onAbiertoChange={setDialogAltaAbierto}
          inicial={{ telefono: conversacionActiva.telefono, nombre: conversacionActiva.nombre ?? "", tags: [], notas: "" }}
          onGuardado={() => {
            setDialogAltaAbierto(false);
            void cargarInbox();
          }}
        />
      ) : null}
    </div>
  );
}
