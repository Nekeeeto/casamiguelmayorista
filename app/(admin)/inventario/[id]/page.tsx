import Link from "next/link";
import { notFound } from "next/navigation";

import { InventarioProductoPim } from "@/components/admin/inventario-producto-pim";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllWooProductCategories, fetchWooProductRawById } from "@/lib/woo";

type Props = {
  params: Promise<{ id: string }>;
};

type ProveedorOpcion = {
  id: string;
  nombre_fantasia: string;
  logo_url: string | null;
};

export default async function InventarioProductoDumpPage({ params }: Props) {
  const { id } = await params;
  const productId = Number.parseInt(id, 10);
  if (!Number.isFinite(productId) || productId <= 0) {
    notFound();
  }

  try {
    const [productoWoo, categoriasWoo] = await Promise.all([
      fetchWooProductRawById(productId),
      fetchAllWooProductCategories(),
    ]);

    const supabase = getSupabaseAdmin();
    type RespuestaPm = { data: unknown; error: { message: string } | null };
    let respuestaPm = (await supabase
      .from("productos_mayoristas")
      .select("precio_venta, precio_costo, escalas_volumen, proveedor_id")
      .eq("woo_product_id", productId)
      .maybeSingle()) as RespuestaPm;

    if (respuestaPm.error && respuestaPm.error.message.includes("proveedor_id")) {
      respuestaPm = (await supabase
        .from("productos_mayoristas")
        .select("precio_venta, precio_costo, escalas_volumen")
        .eq("woo_product_id", productId)
        .maybeSingle()) as RespuestaPm;
    }

    const pmData = respuestaPm.data;
    const pmError = respuestaPm.error;

    const { data: proveedoresData, error: proveedoresError } = await supabase
      .from("proveedores")
      .select("id, nombre_fantasia, logo_url")
      .order("nombre_fantasia", { ascending: true });

    if (proveedoresError && !proveedoresError.message.includes("Could not find the table")) {
      throw new Error(proveedoresError.message);
    }

    const proveedoresDisponibles: ProveedorOpcion[] =
      !proveedoresError && Array.isArray(proveedoresData)
        ? (proveedoresData as ProveedorOpcion[])
        : [];

    const precioRetailWoo = Number.parseFloat(
      String(productoWoo.sale_price || productoWoo.regular_price || productoWoo.price || "0").replace(
        ",",
        ".",
      ),
    );

    let datosB2B = {
      precio_mayorista: Number.isFinite(precioRetailWoo) ? Number(precioRetailWoo.toFixed(2)) : 0,
      precio_costo: 0,
      compra_minima: 1,
    };
    let proveedorIdInicial = String((pmData as { proveedor_id?: string | null } | null)?.proveedor_id ?? "");
    const pmFila = (pmData as {
      precio_venta?: number | null;
      precio_costo?: number | null;
      escalas_volumen?: unknown;
    } | null);

    const tablaNoExistePM =
      pmError?.message?.includes("Could not find the table 'public.productos_mayoristas'") ?? false;

    if (!pmError || !tablaNoExistePM) {
      if (pmError) {
        throw new Error(pmError.message);
      }
      const escalas = Array.isArray(pmFila?.escalas_volumen)
        ? (pmFila?.escalas_volumen as Array<{ cantidad_minima?: unknown }>)
        : [];
      const minimaEscala = Number(escalas[0]?.cantidad_minima);
      datosB2B = {
        precio_mayorista: Number(pmFila?.precio_venta ?? datosB2B.precio_mayorista),
        precio_costo: Number(pmFila?.precio_costo ?? 0),
        compra_minima: Number.isFinite(minimaEscala) && minimaEscala > 0 ? Math.floor(minimaEscala) : 1,
      };
    } else {
      const { data: wpData, error: wpError } = await supabase
        .from("wholesale_products")
        .select("custom_price, precio_costo, min_quantity, proveedor_id")
        .eq("woo_product_id", productId)
        .maybeSingle();

      if (wpError && !wpError.message.includes("Could not find the table")) {
        throw new Error(wpError.message);
      }
      if (wpData) {
        proveedorIdInicial = String((wpData as { proveedor_id?: string | null }).proveedor_id ?? "");
        datosB2B = {
          precio_mayorista: Number(wpData.custom_price ?? datosB2B.precio_mayorista),
          precio_costo: Number(wpData.precio_costo ?? 0),
          compra_minima: Math.max(1, Number(wpData.min_quantity ?? 1)),
        };
      }
    }

    return (
      <section className="space-y-6">
        <InventarioProductoPim
          productId={productId}
          productoInicial={productoWoo}
          categoriasDisponibles={categoriasWoo.map((c) => ({
            id: c.id,
            name: c.name,
            parent: c.parent,
          }))}
          datosB2BIniciales={datosB2B}
          proveedoresDisponibles={proveedoresDisponibles}
          proveedorIdInicial={proveedorIdInicial}
        />
      </section>
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "No se pudo obtener el producto de Woo.";
    return (
      <section className="space-y-6">
        <Card className="border-destructive/40 bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Error cargando producto #{productId}</CardTitle>
            <CardDescription>{msg}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/admin?tab=inventario"
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Volver a Inventario
            </Link>
          </CardContent>
        </Card>
      </section>
    );
  }
}
