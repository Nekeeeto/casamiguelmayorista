"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ValoresConfig = {
  phone_number_id: string;
  waba_id: string;
  webhook_verify_token: string;
  access_token_presente: boolean;
};

type RespuestaGet = {
  fuente: "db" | "env" | "mixto" | "vacio";
  updatedAt: string | null;
  pricing: { marketing: number; utility: number; authentication: number };
  valores: ValoresConfig;
};

type RespuestaTest =
  | {
      ok: true;
      display_phone_number: string;
      verified_name: string;
      quality_rating: string | null;
      messaging_limit_tier: string | null;
    }
  | { ok: false; error: string; code: number | null };

const FUENTE_LABEL: Record<RespuestaGet["fuente"], string> = {
  db: "Guardada en la base",
  env: "Leída de variables de entorno",
  mixto: "Parcialmente guardada + env",
  vacio: "Sin configurar",
};

export function WhatsappConfiguracionTab() {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [fuente, setFuente] = useState<RespuestaGet["fuente"]>("vacio");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [pricing, setPricing] = useState({ marketing: 0.055, utility: 0.0137, authentication: 0.0312 });
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [accessTokenPresente, setAccessTokenPresente] = useState(false);
  const [wabaId, setWabaId] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [ultimoTest, setUltimoTest] = useState<RespuestaTest | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/admin/whatsapp/configuracion", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as RespuestaGet;
      setFuente(data.fuente);
      setUpdatedAt(data.updatedAt);
      setPricing(data.pricing);
      setPhoneNumberId(data.valores.phone_number_id);
      setWabaId(data.valores.waba_id);
      setVerifyToken(data.valores.webhook_verify_token);
      setAccessTokenPresente(data.valores.access_token_presente);
    } catch (error) {
      toast.error("No se pudo cargar la configuración.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(async () => {
    setGuardando(true);
    try {
      const body: Record<string, unknown> = {
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        webhook_verify_token: verifyToken,
        pricing,
      };
      if (accessToken.trim()) body.access_token = accessToken.trim();
      const res = await fetch("/api/admin/whatsapp/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      toast.success("Configuración guardada.");
      setAccessToken("");
      await cargar();
    } catch (error) {
      toast.error("No se pudo guardar.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setGuardando(false);
    }
  }, [accessToken, cargar, phoneNumberId, pricing, verifyToken, wabaId]);

  const probar = useCallback(async () => {
    setProbando(true);
    setUltimoTest(null);
    try {
      const res = await fetch("/api/admin/whatsapp/configuracion?action=test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as RespuestaTest;
      setUltimoTest(data);
      if (data.ok) {
        toast.success("Conexión OK.", { description: `${data.verified_name} — ${data.display_phone_number}` });
      } else {
        toast.error("Conexión falló.", { description: data.error });
      }
    } catch (error) {
      toast.error("Error probando conexión.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setProbando(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Credenciales de WhatsApp Cloud API</CardTitle>
            <CardDescription>
              Se guarda en Supabase; las env vars son fallback. El access token nunca vuelve al cliente.
            </CardDescription>
          </div>
          <Badge variante={fuente === "vacio" ? "warning" : "default"}>{FUENTE_LABEL[fuente]}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wa-phone-number-id">Phone Number ID</Label>
              <Input
                id="wa-phone-number-id"
                placeholder="Ej: 1234567890123456"
                value={phoneNumberId}
                onChange={(event) => setPhoneNumberId(event.target.value)}
                disabled={cargando}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-waba-id">WhatsApp Business Account ID (WABA)</Label>
              <Input
                id="wa-waba-id"
                placeholder="Ej: 98765432109876"
                value={wabaId}
                onChange={(event) => setWabaId(event.target.value)}
                disabled={cargando}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-access-token">
              Access Token{" "}
              {accessTokenPresente && !accessToken ? (
                <span className="ml-1 text-xs text-muted-foreground">(ya guardado — dejar vacío para no cambiar)</span>
              ) : null}
            </Label>
            <Input
              id="wa-access-token"
              type="password"
              placeholder={accessTokenPresente ? "••••••••••••••••" : "EAA..."}
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              autoComplete="off"
              disabled={cargando}
            />
            <p className="text-xs text-muted-foreground">
              Usá un <strong>System User token permanente</strong> desde Facebook Business Manager; los tokens de usuario caducan.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-verify-token">Webhook Verify Token</Label>
            <Input
              id="wa-verify-token"
              placeholder="Cadena aleatoria elegida por vos"
              value={verifyToken}
              onChange={(event) => setVerifyToken(event.target.value)}
              disabled={cargando}
            />
            <p className="text-xs text-muted-foreground">
              Mismo valor que configurás en Meta &gt; Webhook &gt; Verify Token para{" "}
              <code className="rounded bg-muted px-1">/api/whatsapp/webhook</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button onClick={() => void guardar()} disabled={guardando || cargando}>
              {guardando ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar
            </Button>
            <Button variant="outline" onClick={() => void probar()} disabled={probando || cargando}>
              {probando ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
              Probar conexión
            </Button>
            {updatedAt ? (
              <span className="text-xs text-muted-foreground">Última actualización: {new Date(updatedAt).toLocaleString("es-UY")}</span>
            ) : null}
          </div>

          {ultimoTest ? (
            <div
              className={
                ultimoTest.ok
                  ? "rounded-md border border-primary/40 bg-primary/10 p-3 text-sm"
                  : "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              }
            >
              {ultimoTest.ok ? (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4" />
                  <div className="space-y-1">
                    <p className="font-medium">Conectado: {ultimoTest.verified_name}</p>
                    <p className="text-muted-foreground">Número: {ultimoTest.display_phone_number}</p>
                    {ultimoTest.quality_rating ? (
                      <p className="text-muted-foreground">Calidad: {ultimoTest.quality_rating}</p>
                    ) : null}
                    {ultimoTest.messaging_limit_tier ? (
                      <p className="text-muted-foreground">Tier: {ultimoTest.messaging_limit_tier}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <XCircle className="mt-0.5 size-4" />
                  <div className="space-y-1">
                    <p className="font-medium">Conexión rechazada por Meta</p>
                    <p>{ultimoTest.error}</p>
                    {ultimoTest.code ? <p>Código {ultimoTest.code}</p> : null}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Precios por categoría (USD / mensaje)</CardTitle>
          <CardDescription>
            Se usan para estimar el coste de un broadcast. Tarifa de referencia Meta Uruguay 2025.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="wa-precio-marketing">Marketing</Label>
            <Input
              id="wa-precio-marketing"
              type="number"
              step="0.0001"
              value={pricing.marketing}
              onChange={(event) => setPricing((p) => ({ ...p, marketing: Number(event.target.value) }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa-precio-utility">Utility</Label>
            <Input
              id="wa-precio-utility"
              type="number"
              step="0.0001"
              value={pricing.utility}
              onChange={(event) => setPricing((p) => ({ ...p, utility: Number(event.target.value) }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa-precio-auth">Authentication</Label>
            <Input
              id="wa-precio-auth"
              type="number"
              step="0.0001"
              value={pricing.authentication}
              onChange={(event) => setPricing((p) => ({ ...p, authentication: Number(event.target.value) }))}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
