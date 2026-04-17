import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { listApprovedTemplates, WhatsappCloudApiError } from "@/lib/whatsapp-cloud-api";
import { leerConfigWhatsapp } from "@/lib/whatsapp-config";
import { estimarCosteBroadcast } from "@/lib/whatsapp-pricing";
import {
  esTelefonoUyValido,
  normalizarTelefonoWaUruguay,
  validarListaNumerosUy,
} from "@/lib/telefono-wa-uruguay";

type InputEstimar = {
  templateName: string;
  templateLanguage: string;
  numerosRaw?: string;
  contactIds?: string[];
  filtroTags?: string[];
  incluirOptOut?: boolean;
};

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: InputEstimar;
  try {
    body = (await req.json()) as InputEstimar;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!body.templateName || !body.templateLanguage) {
    return NextResponse.json({ error: "Falta template." }, { status: 400 });
  }

  try {
    const config = await leerConfigWhatsapp();

    let templates;
    try {
      templates = await listApprovedTemplates(config);
    } catch (error) {
      if (error instanceof WhatsappCloudApiError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
      }
      throw error;
    }

    const template = templates.find(
      (t) => t.name === body.templateName && t.language === body.templateLanguage,
    );
    if (!template) {
      return NextResponse.json({ error: "Template no encontrado en Meta." }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const telefonosValidos = new Set<string>();
    const invalidos: { input: string; motivo: string }[] = [];
    const contactosPorTelefono = new Map<string, { id: string; nombre: string; opted_out: boolean }>();

    if (body.numerosRaw?.trim()) {
      const { validos, invalidos: inv } = validarListaNumerosUy(body.numerosRaw);
      for (const v of validos) telefonosValidos.add(v);
      invalidos.push(...inv);
    }

    const idsExtra = new Set<string>(body.contactIds ?? []);
    const usaContactos = idsExtra.size > 0 || (body.filtroTags && body.filtroTags.length > 0);

    if (usaContactos) {
      let query = supabase.from("whatsapp_contacts").select("id, nombre, telefono, opted_out");
      if (idsExtra.size > 0) {
        query = query.in("id", Array.from(idsExtra));
      }
      if (body.filtroTags && body.filtroTags.length > 0) {
        query = query.contains("tags", body.filtroTags);
      }
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      for (const fila of (data ?? []) as { id: string; nombre: string; telefono: string; opted_out: boolean }[]) {
        const tel = normalizarTelefonoWaUruguay(fila.telefono);
        if (!tel || !esTelefonoUyValido(tel)) {
          invalidos.push({ input: fila.telefono, motivo: "Contacto con teléfono inválido." });
          continue;
        }
        telefonosValidos.add(tel);
        contactosPorTelefono.set(tel, { id: fila.id, nombre: fila.nombre, opted_out: fila.opted_out });
      }
    }

    const telefonos = Array.from(telefonosValidos);
    let optOuts: Set<string>;
    if (body.incluirOptOut) {
      optOuts = new Set();
    } else {
      const { data: existentes } = await supabase
        .from("whatsapp_contacts")
        .select("telefono, opted_out, id, nombre")
        .in("telefono", telefonos);
      optOuts = new Set(
        (existentes ?? [])
          .filter((e: { opted_out: boolean }) => e.opted_out)
          .map((e: { telefono: string }) => e.telefono),
      );
      for (const e of (existentes ?? []) as { id: string; nombre: string; telefono: string; opted_out: boolean }[]) {
        if (!contactosPorTelefono.has(e.telefono)) {
          contactosPorTelefono.set(e.telefono, { id: e.id, nombre: e.nombre, opted_out: e.opted_out });
        }
      }
    }

    const validosParaEnviar = telefonos.filter((t) => !optOuts.has(t));
    const saltadosOptOut = telefonos.length - validosParaEnviar.length;
    const coste = estimarCosteBroadcast(config.pricing, template, validosParaEnviar.length);

    return NextResponse.json({
      template: {
        name: template.name,
        language: template.language,
        category: template.category,
      },
      totalValidos: validosParaEnviar.length,
      totalLeidos: telefonos.length,
      invalidos,
      saltadosOptOut,
      coste,
      destinatarios: validosParaEnviar.map((tel) => ({
        telefono: tel,
        contactId: contactosPorTelefono.get(tel)?.id ?? null,
        nombre: contactosPorTelefono.get(tel)?.nombre ?? null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error estimando broadcast.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
