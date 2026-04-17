export default function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
