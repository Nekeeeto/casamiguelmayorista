import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AdminDashboardHeader } from "@/components/admin/admin-dashboard-header";
import { Button } from "@/components/ui/button";

import HerramientasIaLoader from "./herramientas-ia-loader";

export default function HerramientasIaPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/admin" aria-label="Volver al panel de administración">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
        </Button>
        <AdminDashboardHeader pestanaActiva="herramientasIa" />
      </div>
      <HerramientasIaLoader />
    </section>
  );
}
