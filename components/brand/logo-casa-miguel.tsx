export function LogoCasaMiguel({ compacto = false }: { compacto?: boolean }) {
  return (
    <div className="inline-flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-primary/10 text-sm font-semibold text-primary">
        CM
      </div>
      {!compacto ? (
        <div className="space-y-0.5">
          <p className="text-sm font-semibold tracking-wide text-foreground">Casa Miguel</p>
          <p className="text-xs text-muted-foreground">Mayoristas B2B</p>
        </div>
      ) : null}
    </div>
  );
}
