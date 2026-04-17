"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";

export type ContactoFormularioDatos = {
  id?: string;
  nombre: string;
  telefono: string;
  tags: string[];
  notas: string;
};

type Props = {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  inicial?: Partial<ContactoFormularioDatos> | null;
  onGuardado?: (id: string) => void;
  tagsSugeridos?: string[];
};

export function WhatsappContactoDialog({ abierto, onAbiertoChange, inicial, onGuardado, tagsSugeridos = [] }: Props) {
  const esEdicion = Boolean(inicial?.id);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tagsTexto, setTagsTexto] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setNombre(inicial?.nombre ?? "");
      setTelefono(inicial?.telefono ?? "");
      setTagsTexto((inicial?.tags ?? []).join(", "));
      setNotas(inicial?.notas ?? "");
    }
  }, [abierto, inicial]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const body = {
        nombre,
        telefono,
        tags: tagsTexto
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        notas,
      };
      const url = esEdicion
        ? `/api/admin/whatsapp/contactos/${encodeURIComponent(inicial!.id!)}`
        : "/api/admin/whatsapp/contactos";
      const res = await fetch(url, {
        method: esEdicion ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { contacto: { id: string } };
      toast.success(esEdicion ? "Contacto actualizado." : "Contacto creado.");
      onGuardado?.(data.contacto.id);
      onAbiertoChange(false);
    } catch (error) {
      toast.error(esEdicion ? "No se pudo actualizar." : "No se pudo crear.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? "Editar contacto" : "Agregar contacto"}</DialogTitle>
          <DialogDescription>Guardalos en la base de WhatsApp para broadcasts segmentados.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wa-contact-nombre">Nombre</Label>
            <Input
              id="wa-contact-nombre"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-contact-tel">Teléfono</Label>
            <Input
              id="wa-contact-tel"
              value={telefono}
              onChange={(event) => setTelefono(event.target.value)}
              placeholder="+598 9X XXX XXX"
              disabled={esEdicion}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-contact-tags">Tags (separadas por coma)</Label>
            <Input
              id="wa-contact-tags"
              value={tagsTexto}
              onChange={(event) => setTagsTexto(event.target.value)}
              placeholder="mayorista, feria, vip"
            />
            {tagsSugeridos.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Sugeridas: {tagsSugeridos.slice(0, 12).join(", ")}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-contact-notas">Notas</Label>
            <Textarea
              id="wa-contact-notas"
              rows={3}
              value={notas}
              onChange={(event) => setNotas(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando ? <Loader2 className="size-4 animate-spin" /> : null}
            {esEdicion ? "Guardar cambios" : "Crear contacto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
