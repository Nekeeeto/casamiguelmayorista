import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const MAX_BYTES = 16 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "video/mp4",
]);

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "FormData inválido." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta archivo (campo file)." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Archivo demasiado grande (máx. 16 MB)." }, { status: 400 });
  }
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.has(type)) {
    return NextResponse.json(
      { error: "Tipo no permitido. Usá JPEG, PNG, WebP o GIF." },
      { status: 400 },
    );
  }

  const ext =
    type === "image/jpeg"
      ? "jpg"
      : type === "image/png"
        ? "png"
        : type === "image/webp"
          ? "webp"
          : type === "image/gif"
            ? "gif"
            : type === "application/pdf"
              ? "pdf"
              : type === "video/mp4"
                ? "mp4"
                : "bin";
  const path = `wa/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const supabase = getSupabaseAdmin();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from("whatsapp-media").upload(path, buf, {
    contentType: type,
    upsert: false,
  });
  if (error) {
    return NextResponse.json(
      {
        error: `${error.message} (¿existe el bucket público whatsapp-media? Ver supabase/schema_phase10_whatsapp_storage.sql).`,
      },
      { status: 500 },
    );
  }
  const { data: pub } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
  return NextResponse.json({ url: pub.publicUrl });
}
