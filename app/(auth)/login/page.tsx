"use client";

import Link from "next/link";
import { Suspense, type FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { LogoCasaMiguel } from "@/components/brand/logo-casa-miguel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AUTH_REMEMBER_STORAGE_KEY,
  getSupabaseBrowser,
  resetSupabaseBrowser,
} from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

function normalizarErrorLogin(mensaje: string) {
  const texto = mensaje.toLowerCase();
  if (texto.includes("invalid login credentials")) {
    return "Credenciales inválidas. Revisá correo y contraseña.";
  }
  return "No se pudo iniciar sesión. Intentá de nuevo.";
}

function LoginCargando() {
  return (
    <Card
      className={cn(
        "border-border/80 bg-card/95 shadow-lg shadow-primary/5 backdrop-blur-sm",
        "ring-1 ring-border/60",
      )}
    >
      <CardHeader className="flex-col items-start gap-4 border-b border-border/60 pb-6">
        <LogoCasaMiguel />
        <div className="space-y-1">
          <CardTitle className="text-xl font-semibold tracking-tight">Iniciar sesión</CardTitle>
          <CardDescription>Cargando formulario…</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex justify-center py-12">
        <Loader2 className="size-9 animate-spin text-primary" aria-hidden />
      </CardContent>
    </Card>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [recordarme, setRecordarme] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v =
        window.localStorage.getItem(AUTH_REMEMBER_STORAGE_KEY) ??
        window.sessionStorage.getItem(AUTH_REMEMBER_STORAGE_KEY);
      setRecordarme(v === "1");
    } catch {
      setRecordarme(false);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      try {
        window.localStorage.setItem(AUTH_REMEMBER_STORAGE_KEY, recordarme ? "1" : "0");
      } catch {
        /** modo privado: intentar sessionStorage para esta pestaña */
      }
      try {
        window.sessionStorage.setItem(AUTH_REMEMBER_STORAGE_KEY, recordarme ? "1" : "0");
      } catch {
        /** sin storage disponible: cookies de sesión por defecto */
      }
      resetSupabaseBrowser();
      const supabase = getSupabaseBrowser();
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password: contrasena,
      });

      if (loginError) {
        throw new Error(normalizarErrorLogin(loginError.message));
      }

      const { data: perfil, error: perfilError } = await supabase
        .from("perfiles_usuarios")
        .select("rol, datos_onboarding")
        .eq("id", data.user.id)
        .maybeSingle();

      if (perfilError) {
        throw new Error("No se pudo validar el estado de la cuenta.");
      }

      if (!perfil || perfil.rol === "pendiente") {
        await supabase.auth.signOut();
        throw new Error("Cuenta pendiente de aprobación.");
      }

      if (perfil.datos_onboarding?.bloqueado === true) {
        await supabase.auth.signOut();
        throw new Error("Cuenta bloqueada. Contactá al equipo comercial.");
      }

      const redirect = searchParams.get("redirect");
      if (perfil.rol === "admin") {
        router.push(redirect ?? "/admin");
        return;
      }
      if (perfil.rol === "shop_manager") {
        router.push(redirect ?? "/admin?tab=inventario&page=1");
        return;
      }

      router.push(redirect ?? "/admin");
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/80 bg-card/95 shadow-lg shadow-primary/[0.07] backdrop-blur-sm",
        "ring-1 ring-border/60",
      )}
    >
      <div className="h-1 w-full bg-linear-to-r from-primary via-primary/80 to-accent/90" aria-hidden />
      <CardHeader className="flex-col items-start gap-5 pb-2 pt-7">
        <LogoCasaMiguel />
        <div className="space-y-1.5">
          <CardTitle className="text-xl font-semibold tracking-tight">Iniciar sesión</CardTitle>
          <CardDescription className="text-pretty leading-relaxed">
            Acceso al panel interno (inventario, pedidos y administración según tu rol).
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pb-8 pt-2">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="compras@empresa.com"
              className="h-11 bg-background/80"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contrasena">Contraseña</Label>
            <Input
              id="contrasena"
              type="password"
              autoComplete="current-password"
              value={contrasena}
              onChange={(event) => setContrasena(event.target.value)}
              placeholder="••••••••"
              className="h-11 bg-background/80"
              required
            />
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/25 px-3 py-3">
            <Checkbox
              id="recordarme"
              checked={recordarme}
              onCheckedChange={(v) => setRecordarme(v === true)}
              className="mt-0.5"
              disabled={enviando}
            />
            <div className="grid gap-1 leading-none">
              <Label
                htmlFor="recordarme"
                className="cursor-pointer text-sm font-medium leading-snug text-foreground peer-disabled:cursor-not-allowed"
              >
                Recordarme en este navegador
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Si está marcado, la sesión se guarda más tiempo en este equipo. Desmarcá en computadoras
                compartidas.
              </p>
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" className="h-11 w-full font-medium" disabled={enviando}>
            {enviando ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Validando acceso…
              </>
            ) : (
              "Ingresar"
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            ¿Aún no tenés cuenta?{" "}
            <Link
              href="/registro"
              className="font-medium text-primary underline-offset-4 hover:text-primary/90 hover:underline"
            >
              Solicitá acceso mayorista
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginCargando />}>
      <LoginForm />
    </Suspense>
  );
}
