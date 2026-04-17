import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type MensajeFila = {
  id: string;
  from_phone: string;
  to_phone: string;
  direction: "in" | "out";
  body: string;
  media_type: string | null;
  received_at: string;
  status: string;
};

type ContactoFila = {
  id: string;
  nombre: string;
  telefono: string;
  opted_out: boolean;
};

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = getSupabaseAdmin();
  const { data: mensajes, error } = await supabase
    .from("whatsapp_messages")
    .select("id, from_phone, to_phone, direction, body, media_type, received_at, status")
    .order("received_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const porContacto = new Map<
    string,
    { telefono: string; ultimo: MensajeFila; entrantesNoLeidos: number; ultimoEntrante: MensajeFila | null }
  >();
  for (const m of (mensajes ?? []) as MensajeFila[]) {
    const telefono = m.direction === "in" ? m.from_phone : m.to_phone;
    const actual = porContacto.get(telefono);
    if (!actual) {
      porContacto.set(telefono, {
        telefono,
        ultimo: m,
        entrantesNoLeidos: m.direction === "in" && m.status !== "read" ? 1 : 0,
        ultimoEntrante: m.direction === "in" ? m : null,
      });
    } else {
      if (m.direction === "in" && !actual.ultimoEntrante) {
        actual.ultimoEntrante = m;
      }
      if (m.direction === "in" && m.status !== "read") {
        actual.entrantesNoLeidos += 1;
      }
    }
  }

  const telefonos = Array.from(porContacto.keys());
  let contactos: ContactoFila[] = [];
  if (telefonos.length > 0) {
    const { data: filas } = await supabase
      .from("whatsapp_contacts")
      .select("id, nombre, telefono, opted_out")
      .in("telefono", telefonos);
    contactos = (filas ?? []) as ContactoFila[];
  }
  const mapContacto = new Map<string, ContactoFila>();
  for (const c of contactos) mapContacto.set(c.telefono, c);

  const conversaciones = Array.from(porContacto.values())
    .map((conv) => {
      const contacto = mapContacto.get(conv.telefono);
      return {
        telefono: conv.telefono,
        nombre: contacto?.nombre ?? null,
        contactId: contacto?.id ?? null,
        optedOut: contacto?.opted_out ?? false,
        ultimo: conv.ultimo,
        ultimoEntrante: conv.ultimoEntrante,
        entrantesNoLeidos: conv.entrantesNoLeidos,
      };
    })
    .sort((a, b) => new Date(b.ultimo.received_at).getTime() - new Date(a.ultimo.received_at).getTime());

  return NextResponse.json({ conversaciones });
}
