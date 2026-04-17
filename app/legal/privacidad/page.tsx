import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad | Casa Miguel Mayoristas",
  description: "Política de privacidad del panel mayoristas y mensajería WhatsApp Business.",
};

export default function PrivacidadPage() {
  return (
    <article className="space-y-4 text-sm leading-relaxed text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">Política de privacidad</h1>
      <p className="text-sm text-muted-foreground">Última actualización: abril de 2026</p>

      <h2 className="mt-8 text-lg font-medium">1. Responsable</h2>
      <p>
        El titular del tratamiento de los datos personales asociados al uso del sitio web y aplicaciones
        vinculadas a <strong>Casa Miguel</strong> (mayorista de artículos de fiesta y cotillón) es Casa
        Miguel, con domicilio en Uruguay. Para consultas sobre esta política podés escribir a{" "}
        <a href="mailto:contacto@casamiguel.uy" className="text-primary underline">
          contacto@casamiguel.uy
        </a>
        .
      </p>

      <h2 className="mt-8 text-lg font-medium">2. Alcance</h2>
      <p>
        Esta política aplica al panel de administración en <strong>mayoristas.casamiguel.uy</strong>, incluidas
        las herramientas internas (por ejemplo, gestión de pedidos, inventario y comunicaciones con
        clientes mediante <strong>WhatsApp Business</strong> cuando corresponda).
      </p>

      <h2 className="mt-8 text-lg font-medium">3. Datos que podemos tratar</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Datos de cuenta y autenticación (correo electrónico, identificadores de sesión).</li>
        <li>Datos operativos de pedidos, facturación y logística cuando usás los servicios mayoristas.</li>
        <li>
          Datos de contacto y mensajes necesarios para atención comercial por WhatsApp (incluido número de
          teléfono, contenido del mensaje y metadatos técnicos requeridos por Meta/WhatsApp).
        </li>
        <li>Datos técnicos habituales (dirección IP, tipo de navegador, registros de seguridad).</li>
      </ul>

      <h2 className="mt-8 text-lg font-medium">4. Finalidades</h2>
      <p>
        Tratamos los datos para prestar el servicio mayorista, gestionar pedidos, cumplir obligaciones
        legales, mejorar la seguridad del sistema y comunicarnos con vos cuando lo solicites o cuando sea
        necesario para la relación comercial.
      </p>

      <h2 className="mt-8 text-lg font-medium">5. Base legal y derechos</h2>
      <p>
        El tratamiento se funda en la ejecución de contratos o medidas precontractuales, el interés legítimo
        en la seguridad y mejora del servicio, y —cuando corresponda— tu consentimiento. En Uruguay podés
        ejercer los derechos previstos en la Ley 18.331 y normativa aplicable (acceso, rectificación,
        actualización, supresión, oposición, etc.) contactándonos al correo indicado arriba.
      </p>

      <h2 className="mt-8 text-lg font-medium">6. Encargados y transferencias</h2>
      <p>
        Podemos utilizar proveedores que actúan como encargados (por ejemplo, alojamiento, base de datos,
        Meta Platforms, Inc. en el marco de WhatsApp Business API). Esos proveedores solo tratan datos según
        instrucciones y medidas contractuales adecuadas.
      </p>

      <h2 className="mt-8 text-lg font-medium">7. Conservación</h2>
      <p>
        Conservamos los datos el tiempo necesario para las finalidades indicadas y para cumplir obligaciones
        legales o resolver reclamos.
      </p>

      <h2 className="mt-8 text-lg font-medium">8. Cambios</h2>
      <p>
        Podemos actualizar esta política. La versión vigente estará publicada en esta URL; te recomendamos
        revisarla periódicamente.
      </p>

      <p className="mt-10">
        <Link href="/legal/terminos" className="text-primary underline">
          Condiciones del servicio
        </Link>
        {" · "}
        <Link href="/legal/eliminacion-datos" className="text-primary underline">
          Eliminación de datos
        </Link>
      </p>
    </article>
  );
}
