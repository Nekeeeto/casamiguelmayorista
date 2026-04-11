"use client";

import { Suspense, type FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { LogoCasaMiguel } from "@/components/brand/logo-casa-miguel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

function normalizarErrorLogin(mensaje: string) {
  const texto = mensaje.toLowerCase();
  if (texto.includes("invalid login credentials")) {
    return "Credenciales invalidas. Revisa correo y contrasena.";
  }
  return "No se pudo iniciar sesion. Intenta nuevamente.";
}

function LoginCargando() {
  return (
    <Card className="border-border bg-card/95 shadow-sm">
      <CardHeader className="flex-col items-start gap-4">
        <LogoCasaMiguel />
        <div className="space-y-1">
          <CardTitle className="text-xl">Acceso de clientes mayoristas</CardTitle>
          <CardDescription>Cargando formulario…</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex justify-center py-10">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
      </CardContent>
    </Card>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setEnviando(true);

    try {
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
        throw new Error("Cuenta pendiente de aprobacion.");
      }

      if (perfil.datos_onboarding?.bloqueado === true) {
        await supabase.auth.signOut();
        throw new Error("Cuenta bloqueada. Contacta al equipo comercial.");
      }

      const redirect = searchParams.get("redirect");
      if (perfil.rol === "admin") {
        router.push(redirect ?? "/admin/usuarios");
        return;
      }

      router.push(redirect ?? "/panel");
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo iniciar sesion.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="border-border bg-card/95 shadow-sm">
      <CardHeader className="flex-col items-start gap-4">
        <LogoCasaMiguel />
        <div className="space-y-1">
          <CardTitle className="text-xl">Acceso de clientes mayoristas</CardTitle>
          <CardDescription>
            Ingresa para comprar, gestionar pedidos o administrar catalogo B2B.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="compras@empresa.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contrasena">Contrasena</Label>
            <Input
              id="contrasena"
              type="password"
              autoComplete="current-password"
              value={contrasena}
              onChange={(event) => setContrasena(event.target.value)}
              placeholder="********"
              required
            />
          </div>
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Validando acceso..." : "Ingresar"}
          </Button>
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
