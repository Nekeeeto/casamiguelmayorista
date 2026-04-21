"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
  avatar_url: string | null;
};

type Props = {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  inicial?: Partial<ContactoFormularioDatos> | null;
  onGuardado?: (id: string) => void;
  tagsSugeridos?: string[];
};

function normalizarTag(t: string): string {
  return t.trim().toLowerCase();
}

export function WhatsappContactoDialog({
  abierto,
  onAbiertoChange,
  inicial,
  onGuardado,
  tagsSugeridos = [],
}: Props) {
  const esEdicion = Boolean(inicial?.id);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [notas, setNotas] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [subiendoAvatar, setSubiendoAvatar] = useState(false);

  useEffect(() => {
    if (abierto) {
      setNombre(inicial?.nombre ?? "");
      setTelefono(inicial?.telefono ?? "");
      setTags([...(inicial?.tags ?? [])]);
      setTagDraft("");
      setNotas(inicial?.notas ?? "");
      setAvatarUrl(inicial?.avatar_url?.trim() ?? "");
    }
  }, [abierto, inicial]);

  const agregarTag = useCallback(() => {
    const t = normalizarTag(tagDraft);
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagDraft("");
  }, [tagDraft]);

  const subirAvatar = async (archivo: File | null) => {
    if (!archivo) return;
    setSubiendoAvatar(true);
    try {
      const fd = new FormData();
      fd.set("file", archivo);
      const res = await fetch("/api/admin/whatsapp/media/upload", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (!data.url) throw new Error("Sin URL.");
      setAvatarUrl(data.url);
      toast.success("Avatar subido.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al subir.");
    } finally {
      setSubiendoAvatar(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const body = {
        nombre,
        telefono,
        tags,
        notas,
        avatar_url: avatarUrl.trim() === "" ? null : avatarUrl.trim(),
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
            <Label htmlFor="wa-contact-avatar">Avatar (URL HTTPS opcional)</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="wa-contact-avatar"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://…"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={subiendoAvatar}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/jpeg,image/png,image/webp,image/gif";
                  input.onchange = () => void subirAvatar(input.files?.[0] ?? null);
                  input.click();
                }}
              >
                {subiendoAvatar ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Subir
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-contact-tag-draft">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="wa-contact-tag-draft"
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    agregarTag();
                  }
                }}
                placeholder="Escribí y Enter"
              />
              <Button type="button" variant="secondary" size="sm" onClick={agregarTag}>
                Añadir
              </Button>
            </div>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-1">
                {tags.map((t) => (
                  <Badge key={t} variante="default" className="gap-1 pr-1">
                    {t}
                    <button
                      type="button"
                      className="rounded p-0.5 hover:bg-muted"
                      aria-label={`Quitar ${t}`}
                      onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
            {tagsSugeridos.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Clic para sumar:{" "}
                {tagsSugeridos.slice(0, 16).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="mr-1 underline-offset-2 hover:underline"
                    onClick={() =>
                      setTags((prev) => (prev.includes(s) ? prev : [...prev, s]))
                    }
                  >
                    {s}
                  </button>
                ))}
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
