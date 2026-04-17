import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Condiciones del servicio | Casa Miguel Mayoristas",
  description: "Condiciones generales de uso del panel mayorista Casa Miguel.",
};

export default function TerminosPage() {
  return (
    <article className="space-y-4 text-sm leading-relaxed text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">Condiciones del servicio</h1>
      <p className="text-sm text-muted-foreground">Última actualización: abril de 2026</p>

      <h2 className="mt-8 text-lg font-medium">1. Objeto</h2>
      <p>
        Estas condiciones regulan el acceso y uso del panel web de administración disponible en{" "}
        <strong>mayoristas.casamiguel.uy</strong> y los servicios asociados a la relación comercial
        mayorista de <strong>Casa Miguel</strong> (en adelante, el &quot;Servicio&quot;).
      </p>

      <h2 className="mt-8 text-lg font-medium">2. Cuentas y acceso</h2>
      <p>
        El acceso al panel puede estar restringido a usuarios autorizados (por ejemplo, personal de Casa
        Miguel o clientes mayoristas con credenciales válidas). Vos sos responsable de mantener la
        confidencialidad de tu contraseña y de las actividades realizadas con tu cuenta.
      </p>

      <h2 className="mt-8 text-lg font-medium">3. Uso aceptable</h2>
      <p>
        Te comprometés a usar el Servicio de buena fe, sin vulnerar la seguridad del sistema, sin acceder a
        datos ajenos a tu perfil autorizado y sin utilizar el Servicio para fines ilícitos o que violen
        derechos de terceros.
      </p>

      <h2 className="mt-8 text-lg font-medium">4. Comunicaciones por WhatsApp</h2>
      <p>
        Cuando utilicemos canales de WhatsApp Business, las comunicaciones se regirán también por las
        políticas de Meta y por la normativa aplicable en materia de protección de datos y comunicaciones
        comerciales. Los clientes finales deben poder ejercer sus derechos (incluida la baja de mensajes
        promocionales cuando corresponda).
      </p>

      <h2 className="mt-8 text-lg font-medium">5. Disponibilidad</h2>
      <p>
        Procuramos mantener el Servicio operativo, pero puede haber interrupciones por mantenimiento,
        causas de fuerza mayor o dependencia de terceros (hosting, Meta, etc.). No garantizamos un
        funcionamiento ininterrumpido.
      </p>

      <h2 className="mt-8 text-lg font-medium">6. Propiedad intelectual</h2>
      <p>
        Los contenidos, marcas y software del panel son de Casa Miguel o de sus licenciantes, salvo
        indicación en contrario. No se otorgan licencias más allá del uso necesario para operar el
        Servicio según lo previsto.
      </p>

      <h2 className="mt-8 text-lg font-medium">7. Ley aplicable</h2>
      <p>
        Estas condiciones se interpretan según las leyes de la República Oriental del Uruguay. Para
        controversias, los tribunales uruguayos podrán resultar competentes según corresponda.
      </p>

      <h2 className="mt-8 text-lg font-medium">8. Contacto</h2>
      <p>
        Consultas:{" "}
        <a href="mailto:contacto@casamiguel.uy" className="text-primary underline">
          contacto@casamiguel.uy
        </a>
        .
      </p>

      <p className="mt-10">
        <Link href="/legal/privacidad" className="text-primary underline">
          Política de privacidad
        </Link>
        {" · "}
        <Link href="/legal/eliminacion-datos" className="text-primary underline">
          Eliminación de datos
        </Link>
      </p>
    </article>
  );
}
