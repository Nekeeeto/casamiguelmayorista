import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseServidor } from "@/lib/supabase-servidor";
import { leerConfigWhatsapp } from "@/lib/whatsapp-config";
import { listApprovedTemplates, WhatsappCloudApiError } from "@/lib/whatsapp-cloud-api";
import { estimarCosteBroadcast } from "@/lib/whatsapp-pricing";
import { ejecutarChunk } from "@/lib/whatsapp-broadcast-runner";
import {
  esTelefonoUyValido,
  normalizarTelefonoWaUruguay,
  validarListaNumerosUy,
} from "@/lib/telefono-wa-uruguay";

type DestinatarioInput = {
  telefono: string;
  variables?: string[];
  contactId?: string | null;
};

type InputCrearBroadcast = {
  templateName: string;
  templateLanguage: string;
  mediaHeader?: { tipo: "image" | "video" | "document"; link: string; filename?: string } | null;
  variablesDefault?: string[];
  destinatarios?: DestinatarioInput[];
  numerosRaw?: string;
  contactIds?: string[];
  filtroTags?: string[];
  usarNombreComoVariable1?: boolean;
};

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_broadcasts")
    .select("id, template_name, template_language, template_category, total, delivered, failed, skipped, status, created_at, coste_estimado_usd")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ broadcasts: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: InputCrearBroadcast;
  try {
    body = (await req.json()) as InputCrearBroadcast;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!body.templateName || !body.templateLanguage) {
    return NextResponse.json({ error: "Falta template." }, { status: 400 });
  }

  try {
    const config = await leerConfigWhatsapp();
    let template;
    try {
      const templates = await listApprovedTemplates(config);
      template = templates.find((t) => t.name === body.templateName && t.language === body.templateLanguage);
    } catch (error) {
      if (error instanceof WhatsappCloudApiError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
      }
      throw error;
    }
    if (!template) {
      return NextResponse.json({ error: "Template no encontrado en Meta." }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();

    const telefonosValidos = new Map<
      string,
      { contactId: string | null; nombre: string | null; variables: string[] }
    >();

    if (Array.isArray(body.destinatarios) && body.destinatarios.length > 0) {
      for (const d of body.destinatarios) {
        const tel = normalizarTelefonoWaUruguay(d.telefono);
        if (!tel || !esTelefonoUyValido(tel)) continue;
        telefonosValidos.set(tel, {
          contactId: d.contactId ?? null,
          nombre: null,
          variables: d.variables ?? body.variablesDefault ?? [],
        });
      }
    } else {
      const telefonosConsolidados = new Set<string>();
      if (body.numerosRaw?.trim()) {
        const { validos } = validarListaNumerosUy(body.numerosRaw);
        for (const v of validos) telefonosConsolidados.add(v);
      }
      if ((body.contactIds && body.contactIds.length > 0) || (body.filtroTags && body.filtroTags.length > 0)) {
        let query = supabase.from("whatsapp_contacts").select("id, nombre, telefono");
        if (body.contactIds && body.contactIds.length > 0) {
          query = query.in("id", body.contactIds);
        }
        if (body.filtroTags && body.filtroTags.length > 0) {
          query = query.contains("tags", body.filtroTags);
        }
        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        for (const fila of (data ?? []) as { id: string; nombre: string; telefono: string }[]) {
          const tel = normalizarTelefonoWaUruguay(fila.telefono);
          if (!tel || !esTelefonoUyValido(tel)) continue;
          telefonosConsolidados.add(tel);
          telefonosValidos.set(tel, {
            contactId: fila.id,
            nombre: fila.nombre,
            variables: [],
          });
        }
      }
      for (const tel of telefonosConsolidados) {
        if (!telefonosValidos.has(tel)) {
          telefonosValidos.set(tel, { contactId: null, nombre: null, variables: [] });
        }
      }
    }

    const telefonos = Array.from(telefonosValidos.keys());
    const { data: optouts } = await supabase
      .from("whatsapp_contacts")
      .select("telefono, opted_out, id, nombre")
      .in("telefono", telefonos);
    const mapContacto = new Map<string, { id: string; nombre: string; opted_out: boolean }>();
    for (const fila of (optouts ?? []) as { id: string; nombre: string; telefono: string; opted_out: boolean }[]) {
      mapContacto.set(fila.telefono, { id: fila.id, nombre: fila.nombre, opted_out: fila.opted_out });
    }

    const variablesDefault = body.variablesDefault ?? [];
    const destinatariosFinales: {
      telefono: string;
      variables: string[] | null;
      contactId: string | null;
      skipped: "opted_out" | null;
    }[] = [];

    for (const [tel, info] of telefonosValidos.entries()) {
      const contacto = mapContacto.get(tel);
      const skipped = contacto?.opted_out ? "opted_out" : null;
      let variables = info.variables.length > 0 ? [...info.variables] : [...variablesDefault];
      if (body.usarNombreComoVariable1) {
        const nombre = info.nombre || contacto?.nombre || "";
        if (variables.length === 0) variables = [nombre];
        else variables[0] = nombre || variables[0];
      }
      destinatariosFinales.push({
        telefono: tel,
        variables: variables.length > 0 ? variables : null,
        contactId: info.contactId ?? contacto?.id ?? null,
        skipped,
      });
    }

    if (destinatariosFinales.length === 0) {
      return NextResponse.json({ error: "No hay destinatarios válidos." }, { status: 400 });
    }

    const total = destinatariosFinales.length;
    const skippedInicial = destinatariosFinales.filter((d) => d.skipped).length;
    const enviables = total - skippedInicial;
    const coste = estimarCosteBroadcast(config.pricing, template, enviables);

    const supabaseServidor = await getSupabaseServidor();
    const {
      data: { user },
    } = await supabaseServidor.auth.getUser();

    const { data: broadcast, error: errCrear } = await supabase
      .from("whatsapp_broadcasts")
      .insert({
        template_name: template.name,
        template_language: template.language,
        template_category: template.category,
        total,
        delivered: 0,
        failed: 0,
        skipped: skippedInicial,
        status: "pendiente",
        next_cursor: 0,
        media_header: body.mediaHeader ?? null,
        template_snapshot: { components: template.components ?? [] },
        variables_default: variablesDefault,
        coste_estimado_usd: coste.totalUsd,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (errCrear || !broadcast) {
      return NextResponse.json({ error: errCrear?.message ?? "No se pudo crear broadcast." }, { status: 500 });
    }

    const filasResultados = destinatariosFinales.map((d) => ({
      broadcast_id: broadcast.id,
      to_phone: d.telefono,
      contact_id: d.contactId,
      variables: d.variables,
      ok: d.skipped ? false : null,
      skipped: d.skipped,
      sent_at: d.skipped ? new Date().toISOString() : null,
    }));

    const CHUNK_INSERT = 500;
    for (let i = 0; i < filasResultados.length; i += CHUNK_INSERT) {
      const slice = filasResultados.slice(i, i + CHUNK_INSERT);
      const { error: errInsert } = await supabase.from("whatsapp_broadcast_results").insert(slice);
      if (errInsert) {
        return NextResponse.json({ error: errInsert.message }, { status: 500 });
      }
    }

    let primerChunk = { processed: 0, remaining: enviables, status: "pendiente" as string };
    try {
      primerChunk = await ejecutarChunk(broadcast.id);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        {
          broadcastId: broadcast.id,
          warning: `Broadcast creado pero falló el primer chunk: ${mensaje}. Reintentá desde el progreso.`,
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      broadcastId: broadcast.id,
      total,
      skipped: skippedInicial,
      coste,
      primerChunk,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error creando broadcast.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
