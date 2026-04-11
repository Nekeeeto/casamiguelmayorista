import { ForzarTemaAdmin } from "@/components/admin/forzar-tema-admin";

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <ForzarTemaAdmin />
      <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
    </main>
  );
}
