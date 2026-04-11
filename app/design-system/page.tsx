import { Building2, Download, Mail, Plus } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";

const semanticSwatches = [
  { token: "background", className: "bg-background", hsl: "210 20% 98%" },
  { token: "foreground", className: "bg-foreground", hsl: "214 24% 14%" },
  { token: "primary", className: "bg-primary", hsl: "194 98% 35%" },
  { token: "secondary", className: "bg-secondary", hsl: "210 30% 94%" },
  { token: "muted", className: "bg-muted", hsl: "210 26% 92%" },
  { token: "accent", className: "bg-accent", hsl: "24 36% 46%" },
  { token: "destructive", className: "bg-destructive", hsl: "0 72% 46%" },
  { token: "border", className: "bg-border", hsl: "214 22% 86%" },
  { token: "input", className: "bg-input", hsl: "214 22% 86%" },
];

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-6 md:p-10">
        <header className="flex items-center justify-between rounded-xl border bg-card p-6">
          <div className="space-y-2">
            <p className="text-sm font-medium tracking-wide text-muted-foreground">
              Casa Miguel Mayoristas
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Design System
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
              Guía visual B2B basada en identidad teal de marca y acentos cobre.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Tipografía</h2>
          <Card>
            <CardContent className="grid gap-5 py-6">
              <div>
                <p className="text-sm text-muted-foreground">H1</p>
                <h1 className="text-4xl font-semibold tracking-tight">
                  Titular principal limpio
                </h1>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">H2</p>
                <h2 className="text-3xl font-semibold tracking-tight">
                  Jerarquía profesional para catálogo
                </h2>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">H3</p>
                <h3 className="text-2xl font-semibold tracking-tight">
                  Secciones operativas de negocio
                </h3>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">P</p>
                <p className="text-base leading-7">
                  La tipografía utiliza una sans-serif geométrica y sobria para
                  transmitir claridad en contextos B2B.
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Small</p>
                <small className="text-sm font-medium">
                  Texto auxiliar para metadatos y etiquetas.
                </small>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Muted</p>
                <p className="text-sm text-muted-foreground">
                  Texto secundario para notas de soporte y contexto.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Colores semánticos</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {semanticSwatches.map((swatch) => (
              <Card key={swatch.token}>
                <CardContent className="space-y-3 py-6">
                  <div className={`h-20 rounded-md border ${swatch.className}`} />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{swatch.token}</p>
                    <p className="text-xs text-muted-foreground">hsl({swatch.hsl})</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Botones Shadcn UI</h2>
          <Card>
            <CardContent className="flex flex-wrap gap-3 py-6">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="destructive">Destructive</Button>
              <Button>
                <Plus className="h-4 w-4" />
                Nuevo pedido
              </Button>
              <Button variant="secondary">
                <Download className="h-4 w-4" />
                Exportar
              </Button>
              <Button variant="outline">
                <Mail className="h-4 w-4" />
                Contacto
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Formularios</h2>
          <Card>
            <CardContent className="grid gap-6 py-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company">Razón social</Label>
                <Input id="company" placeholder="Casa Miguel S.A." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="segment">Segmento comercial</Label>
                <Select>
                  <SelectTrigger id="segment">
                    <SelectValue placeholder="Seleccionar segmento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="almacen">Almacén</SelectItem>
                    <SelectItem value="supermercado">Supermercado</SelectItem>
                    <SelectItem value="gastronomia">Gastronomía</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email de contacto</Label>
                <Input id="email" type="email" placeholder="compras@empresa.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="error-input">RUT (estado error)</Label>
                <Input
                  id="error-input"
                  defaultValue="123"
                  aria-invalid
                  className="border-destructive focus-visible:ring-destructive"
                />
                <p className="text-xs text-destructive">Formato de RUT inválido.</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">Notas comerciales</Label>
                <Textarea
                  id="notes"
                  placeholder="Detalles relevantes para crédito, logística y frecuencia de compra."
                />
              </div>
              <div className="flex items-center gap-3 md:col-span-2">
                <Checkbox id="terms" defaultChecked />
                <Label htmlFor="terms">Acepta condiciones de venta mayorista</Label>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="disabled">Campo deshabilitado</Label>
                <Input
                  id="disabled"
                  defaultValue="Solo lectura operativa"
                  disabled
                />
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Componentes base
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Card base
                </CardTitle>
                <CardDescription>
                  Tarjeta neutra para módulos de inventario, pedidos o clientes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Fondo limpio, borde semántico y jerarquía tipográfica consistente.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Switch y Toggle</CardTitle>
                <CardDescription>
                  Controles rápidos para preferencias operativas.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <Switch id="notifications" defaultChecked />
                  <Label htmlFor="notifications">Notificaciones</Label>
                </div>
                <Toggle defaultPressed>Modo compacto</Toggle>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
