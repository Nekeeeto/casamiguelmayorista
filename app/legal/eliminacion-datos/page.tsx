import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Eliminación de datos | Casa Miguel Mayoristas",
  description: "Cómo solicitar la eliminación de datos personales en el ecosistema Casa Miguel.",
};

export default function EliminacionDatosPage() {
  return (
    <article className="space-y-4 text-sm leading-relaxed text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">Eliminación de datos personales</h1>
      <p className="text-sm text-muted-foreground">Última actualización: abril de 2026</p>

      <h2 className="mt-8 text-lg font-medium">1. Derecho a solicitar la eliminación</h2>
      <p>
        Podés solicitar la supresión o el cese del tratamiento de tus datos personales cuando corresponda
        según la Ley 18.331 y normativa aplicable en Uruguay, sin perjuicio de obligaciones legales de
        conservación (por ejemplo, facturación o reclamos en curso).
      </p>

      <h2 className="mt-8 text-lg font-medium">2. Cómo solicitarlo</h2>
      <p>
        Enviá un correo a{" "}
        <a href="mailto:contacto@casamiguel.uy?subject=Solicitud%20eliminación%20de%20datos" className="text-primary underline">
          contacto@casamiguel.uy
        </a>{" "}
        con el asunto &quot;Solicitud eliminación de datos&quot; e indicá:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>Nombre y apellido o razón social.</li>
        <li>Medio de contacto (correo o teléfono).</li>
        <li>Descripción breve de qué datos o tratamiento querés eliminar o limitar.</li>
        <li>Si tenés cuenta en el panel mayorista, el correo con el que te registraste.</li>
      </ul>

      <h2 className="mt-8 text-lg font-medium">3. Plazos</h2>
      <p>
        Respondemos en un plazo razonable. Si necesitamos verificar tu identidad, te lo pediremos por medios
        adecuados antes de ejecutar la solicitud.
      </p>

      <h2 className="mt-8 text-lg font-medium">4. Datos tratados vía Meta / WhatsApp</h2>
      <p>
        Para datos gestionados a través de plataformas de terceros (por ejemplo, Meta), también podés
        utilizar las herramientas que esas plataformas ofrezcan para privacidad y eliminación, además de
        esta vía de contacto con Casa Miguel.
      </p>

      <h2 className="mt-8 text-lg font-medium">5. Más información</h2>
      <p>
        Los detalles del tratamiento de datos están en nuestra{" "}
        <Link href="/legal/privacidad" className="text-primary underline">
          Política de privacidad
        </Link>
        .
      </p>

      <p className="mt-10">
        <Link href="/legal/privacidad" className="text-primary underline">
          Política de privacidad
        </Link>
        {" · "}
        <Link href="/legal/terminos" className="text-primary underline">
          Condiciones del servicio
        </Link>
      </p>
    </article>
  );
}
