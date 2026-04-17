import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { deleteMessageTemplate, WhatsappCloudApiError } from "@/lib/whatsapp-cloud-api";

type ParamsRuta = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, context: ParamsRuta) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Falta id de plantilla." }, { status: 400 });
  }

  try {
    await deleteMessageTemplate(id.trim());
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WhatsappCloudApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code, status: error.status },
        { status: error.status >= 400 && error.status < 600 ? error.status : 500 },
      );
    }
    const message = error instanceof Error ? error.message : "Error borrando plantilla.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
