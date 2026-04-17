import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AdminDashboardHeader } from "@/components/admin/admin-dashboard-header";

export function HerramientasSubpageShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Volver al panel de administración"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <AdminDashboardHeader pestanaActiva="herramientas" />
      </div>
      {children}
    </section>
  );
}
