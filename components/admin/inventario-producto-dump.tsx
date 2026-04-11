"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { actualizarCampoWooProductoAction } from "@/app/(admin)/inventario/[id]/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type DraftField =
  | { kind: "boolean"; value: boolean; readonly: boolean }
  | {
      kind: "primitive";
      value: string;
      sourceType: "string" | "number" | "nullish";
      readonly: boolean;
    }
  | { kind: "json"; value: string; readonly: boolean };

function isComplexValue(value: unknown): boolean {
  return Array.isArray(value) || (typeof value === "object" && value !== null);
}

function toDraftField(key: string, value: unknown): DraftField {
  const readonly = key === "id";

  if (typeof value === "boolean") {
    return { kind: "boolean", value, readonly };
  }
  if (isComplexValue(value)) {
    return {
      kind: "json",
      value: JSON.stringify(value, null, 2),
      readonly,
    };
  }

  if (typeof value === "number") {
    return {
      kind: "primitive",
      value: String(value),
      sourceType: "number",
      readonly,
    };
  }

  if (value === null || value === undefined) {
    return {
      kind: "primitive",
      value: "",
      sourceType: "nullish",
      readonly,
    };
  }

  return {
    kind: "primitive",
    value: String(value),
    sourceType: "string",
    readonly,
  };
}

function areEqualUnknown(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (isComplexValue(a) || isComplexValue(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function formatFieldKey(key: string) {
  return key.replaceAll("_", " ");
}

type Props = {
  productId: number;
  productoWoo: Record<string, unknown>;
};

type ToastState = { kind: "ok" | "error"; text: string } | null;

export function InventarioProductoDump({ productId, productoWoo }: Props) {
  const [draft, setDraft] = useState<Record<string, DraftField>>(() => {
    const map: Record<string, DraftField> = {};
    for (const [key, value] of Object.entries(productoWoo)) {
      map[key] = toDraftField(key, value);
    }
    return map;
  });
  const [lastSaved, setLastSaved] = useState<Record<string, unknown>>(() => ({ ...productoWoo }));
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (toast == null) {
      return;
    }
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const entries = useMemo(
    () =>
      Object.entries(draft).sort(([a], [b]) => {
        if (a === "id") return -1;
        if (b === "id") return 1;
        return a.localeCompare(b);
      }),
    [draft],
  );

  function parseOutgoing(key: string, field: DraftField): { ok: true; value: unknown } | { ok: false; error: string } {
    if (field.kind === "boolean") {
      return { ok: true, value: field.value };
    }

    if (field.kind === "json") {
      try {
        const parsed = JSON.parse(field.value);
        return { ok: true, value: parsed };
      } catch {
        return { ok: false, error: `JSON invalido en ${key}.` };
      }
    }

    if (field.sourceType === "number") {
      const n = Number.parseFloat(field.value.replace(",", "."));
      if (!Number.isFinite(n)) {
        return { ok: false, error: `Numero invalido en ${key}.` };
      }
      return { ok: true, value: n };
    }

    if (field.sourceType === "nullish" && field.value.trim().length === 0) {
      return { ok: true, value: null };
    }

    return { ok: true, value: field.value };
  }

  function commitField(key: string, overrideField?: DraftField) {
    const field = overrideField ?? draft[key];
    if (!field || field.readonly) {
      return;
    }

    const parsed = parseOutgoing(key, field);
    if (!parsed.ok) {
      setToast({ kind: "error", text: parsed.error });
      return;
    }

    const prev = lastSaved[key];
    if (areEqualUnknown(prev, parsed.value)) {
      return;
    }

    setSavingKey(key);
    startTransition(async () => {
      const res = await actualizarCampoWooProductoAction(productId, key, parsed.value);
      setSavingKey((current) => (current === key ? null : current));

      if (!res.ok) {
        setToast({ kind: "error", text: res.error });
        return;
      }

      setLastSaved((current) => ({ ...current, [key]: res.valor }));
      setDraft((current) => ({ ...current, [key]: toDraftField(key, res.valor) }));
      setToast({ kind: "ok", text: "Actualizado en Woo." });
    });
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <div
          className={`fixed right-4 top-4 z-50 rounded-md border px-3 py-2 text-sm shadow-sm ${
            toast.kind === "ok"
              ? "border-border bg-card text-foreground"
              : "border-destructive/50 bg-destructive/10 text-destructive"
          }`}
        >
          {toast.text}
        </div>
      ) : null}

      <div className="text-sm text-muted-foreground">
        {isPending ? "Guardando..." : "Autoguardado activo: blur (inputs/json) y change (switch)."}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entries.map(([key, field]) => {
          const isSaving = savingKey === key;
          return (
            <div key={key} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {formatFieldKey(key)}
                </Label>
                {field.readonly ? (
                  <span className="text-[10px] text-muted-foreground">Solo lectura</span>
                ) : isSaving ? (
                  <span className="text-[10px] text-muted-foreground">Guardando...</span>
                ) : null}
              </div>

              {field.kind === "boolean" ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{field.value ? "true" : "false"}</span>
                  <Switch
                    checked={field.value}
                    disabled={field.readonly || isSaving}
                    onCheckedChange={(checked) => {
                      const nextField: DraftField = { ...field, value: checked };
                      setDraft((current) => ({
                        ...current,
                        [key]: nextField,
                      }));
                      commitField(key, nextField);
                    }}
                  />
                </div>
              ) : field.kind === "json" ? (
                <Textarea
                  value={field.value}
                  disabled={field.readonly || isSaving}
                  className="min-h-[220px] font-mono text-xs"
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      [key]: { ...field, value: e.target.value },
                    }))
                  }
                  onBlur={() => commitField(key)}
                />
              ) : (
                <Input
                  type={field.sourceType === "number" ? "number" : "text"}
                  value={field.value}
                  disabled={field.readonly || isSaving}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      [key]: { ...field, value: e.target.value },
                    }))
                  }
                  onBlur={() => commitField(key)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
