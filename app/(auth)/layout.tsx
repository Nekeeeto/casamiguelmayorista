import { CabeceraAuthAcciones } from "@/components/auth/cabecera-auth-acciones";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,hsl(var(--primary)/0.14),transparent_50%),radial-gradient(ellipse_90%_60%_at_100%_100%,hsl(var(--accent)/0.1),transparent_45%),radial-gradient(ellipse_70%_50%_at_0%_80%,hsl(var(--primary)/0.06),transparent_40%)]"
        aria-hidden
      />
      <CabeceraAuthAcciones />
      <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  );
}
