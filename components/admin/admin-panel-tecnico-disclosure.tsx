import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  titulo: string;
  children: ReactNode;
};

export function AdminPanelTecnicoDisclosure({ titulo, children }: Props) {
  return (
    <details className="group rounded-lg border border-border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <span>{titulo}</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-6 border-t border-border px-4 pb-4 pt-4">{children}</div>
    </details>
  );
}
