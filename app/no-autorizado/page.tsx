export default function NoAutorizadoPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-xl rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Acceso denegado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No tenes permisos para acceder a esta seccion administrativa.
        </p>
      </div>
    </main>
  );
}
