import { ProductsTable } from "@/components/admin/products-table";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-primary">
            Casa Miguel Mayoristas
          </p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Panel de administración
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
            Activá o desactivá productos de WooCommerce para el canal mayorista.
          </p>
        </header>

        <ProductsTable />
      </div>
    </main>
  );
}
