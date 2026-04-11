import { AdminDashboardHeader } from "@/components/admin/admin-dashboard-header";
import { ProveedoresTablaAdmin } from "@/components/admin/proveedores-tabla-admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type ProveedorFila = {
  id: string;
  nombre_fantasia: string;
  logo_url: string | null;
  rut: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  productos_totales: number;
};

export default async function ProveedoresPage() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("proveedores")
    .select("id, nombre_fantasia, logo_url, rut, contacto, telefono, email")
    .order("nombre_fantasia", { ascending: true });

  if (error && !error.message.includes("Could not find the table")) {
    throw new Error(error.message);
  }

  const proveedoresBase = Array.isArray(data)
    ? (data as Array<Omit<ProveedorFila, "productos_totales">>)
    : [];

  const conteoPorProveedor = new Map<string, number>();
  const sumarConteo = (proveedorId: string | null) => {
    if (!proveedorId) return;
    conteoPorProveedor.set(proveedorId, (conteoPorProveedor.get(proveedorId) ?? 0) + 1);
  };

  const { data: productosMayoristasData, error: productosMayoristasError } = await supabase
    .from("productos_mayoristas")
    .select("proveedor_id");

  const tablaProductosMayoristasNoExiste =
    productosMayoristasError?.message.includes("Could not find the table") ||
    productosMayoristasError?.message.includes("does not exist");

  if (productosMayoristasError && !tablaProductosMayoristasNoExiste) {
    if (productosMayoristasError.message.includes("proveedor_id")) {
      // Columna aún no aplicada: seguimos con 0 para todos.
    } else {
      throw new Error(productosMayoristasError.message);
    }
  }

  if (!productosMayoristasError && Array.isArray(productosMayoristasData)) {
    for (const fila of productosMayoristasData as Array<{ proveedor_id: string | null }>) {
      sumarConteo(fila.proveedor_id);
    }
  }

  if (tablaProductosMayoristasNoExiste) {
    const { data: wholesaleData, error: wholesaleError } = await supabase
      .from("wholesale_products")
      .select("proveedor_id");

    if (wholesaleError && !wholesaleError.message.includes("proveedor_id")) {
      throw new Error(wholesaleError.message);
    }

    if (!wholesaleError && Array.isArray(wholesaleData)) {
      for (const fila of wholesaleData as Array<{ proveedor_id: string | null }>) {
        sumarConteo(fila.proveedor_id);
      }
    }
  }

  const proveedores: ProveedorFila[] = proveedoresBase.map((proveedor) => ({
    ...proveedor,
    productos_totales: conteoPorProveedor.get(proveedor.id) ?? 0,
  }));

  return (
    <section className="space-y-6">
      <AdminDashboardHeader pestanaActiva="proveedores" />

      <Card className="bg-card">
        <CardHeader className="flex-col items-start gap-2">
          <CardTitle className="text-lg">Proveedores</CardTitle>
          <CardDescription>
            Gestioná los datos de contacto y vinculá proveedores con productos del inventario.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProveedoresTablaAdmin proveedoresIniciales={proveedores} />
        </CardContent>
      </Card>
    </section>
  );
}
