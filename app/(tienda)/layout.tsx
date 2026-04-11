export default function TiendaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
    </main>
  );
}
