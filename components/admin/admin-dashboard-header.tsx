import Link from "next/link";
import { BarChart3, Bot, Building2, LayoutGrid, Users } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PestanaAdminHeader = "usuarios" | "inventario" | "analiticas" | "proveedores";

export function AdminDashboardHeader({ pestanaActiva }: { pestanaActiva: PestanaAdminHeader }) {
  return (
    <Card className="bg-card">
      <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-xl">Dashboard Admin General</CardTitle>
          <CardDescription>
            Gestiona usuarios, acceso comercial, productos del canal mayorista y proveedores.
          </CardDescription>
        </div>
        <div className="inline-flex rounded-lg border border-border p-1">
          <Link
            href="/admin?tab=usuarios"
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              pestanaActiva === "usuarios"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="size-4 shrink-0" aria-hidden />
            Usuarios
          </Link>
          <Link
            href="/admin?tab=inventario&page=1"
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              pestanaActiva === "inventario"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="size-4 shrink-0" aria-hidden />
            Inventario
          </Link>
          <Link
            href="/admin?tab=analiticas&analitica=ventas-web"
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              pestanaActiva === "analiticas"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="size-4 shrink-0" aria-hidden />
            Analíticas
          </Link>
          <Link
            href="/proveedores"
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              pestanaActiva === "proveedores"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="size-4 shrink-0" aria-hidden />
            Proveedores
          </Link>
          <Link
            href="/herramientas-ia"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <Bot className="size-4 shrink-0" aria-hidden />
            Herramientas IA
          </Link>
        </div>
      </CardHeader>
    </Card>
  );
}
