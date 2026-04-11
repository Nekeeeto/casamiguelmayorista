import * as React from "react";

import { cn } from "@/lib/utils";

const estilosBadge = {
  default: "border-border bg-muted text-foreground",
  success: "border-primary/40 bg-primary/10 text-foreground",
  warning: "border-secondary bg-secondary/30 text-foreground",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
};

type VarianteBadge = keyof typeof estilosBadge;

export function Badge({
  className,
  variante = "default",
  ...props
}: React.ComponentProps<"span"> & { variante?: VarianteBadge }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        estilosBadge[variante],
        className,
      )}
      {...props}
    />
  );
}
