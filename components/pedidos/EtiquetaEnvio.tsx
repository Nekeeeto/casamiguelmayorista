import { Document, Image as PdfImage, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { WooDireccionPedido, WooPedidoAdmin } from "@/lib/woo-pedido-admin-types";

/** Logo oficial (SVG). Si el motor PDF no lo rasteriza, el layout sigue siendo legible. */
export const ETIQUETA_CASA_MIGUEL_LOGO_URL =
  "https://casamiguel.b-cdn.net/wp-content/uploads/2025/03/Logo-Casa-Miguel-Logotipo-150-px.svg";

const NEGRO = "#000000";

const estilos = StyleSheet.create({
  page: {
    padding: 22,
    fontFamily: "Helvetica",
    color: NEGRO,
    fontSize: 10,
    flexDirection: "column",
  },
  cuerpo: {
    flexGrow: 1,
  },
  filaCabecera: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: NEGRO,
    paddingBottom: 10,
  },
  filaLogo: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 78,
    height: 36,
    objectFit: "contain",
  },
  marcaTexto: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: NEGRO,
    marginLeft: 6,
  },
  remitente: {
    maxWidth: 200,
    textAlign: "right",
    fontSize: 9,
    lineHeight: 1.35,
    color: NEGRO,
  },
  cajaDestinatario: {
    borderWidth: 2,
    borderColor: NEGRO,
    borderStyle: "solid",
    padding: 12,
    marginBottom: 14,
  },
  tituloDestinatario: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    letterSpacing: 0.5,
    color: NEGRO,
  },
  nombreCompleto: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    color: NEGRO,
  },
  direccion: {
    fontSize: 14,
    marginBottom: 4,
    lineHeight: 1.35,
    color: NEGRO,
  },
  ciudadDepto: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginBottom: 6,
    color: NEGRO,
  },
  telefono: {
    fontSize: 12,
    color: NEGRO,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: NEGRO,
    paddingTop: 10,
    fontSize: 9,
    lineHeight: 1.4,
    color: NEGRO,
  },
  footerEtiqueta: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  observacionesTitulo: {
    fontFamily: "Helvetica-Bold",
    marginTop: 6,
    marginBottom: 2,
  },
  observacionesCuerpo: {
    fontSize: 9,
    color: NEGRO,
  },
});

function direccionPreferida(p: WooPedidoAdmin): WooDireccionPedido | undefined {
  const s = p.shipping;
  if (s?.address_1?.trim() || s?.city?.trim() || s?.first_name?.trim()) {
    return s;
  }
  return p.billing;
}

function nombreDestinatario(p: WooPedidoAdmin): string {
  const d = direccionPreferida(p);
  const n = [d?.first_name, d?.last_name].filter(Boolean).join(" ").trim();
  if (n) return n;
  const b = p.billing;
  return [b?.first_name, b?.last_name].filter(Boolean).join(" ").trim() || "—";
}

function lineasDireccion(p: WooPedidoAdmin): string[] {
  const d = direccionPreferida(p) ?? p.billing;
  if (!d) return ["—"];
  const lineas: string[] = [];
  const emp = d.company?.trim();
  if (emp) lineas.push(emp);
  const l1 = d.address_1?.trim();
  const l2 = d.address_2?.trim();
  const cp = d.postcode?.trim();
  if (l1) lineas.push(l1);
  if (l2) lineas.push(l2);
  if (cp) lineas.push(`CP ${cp}`);
  return lineas.length ? lineas : ["—"];
}

function ciudadYDepartamento(p: WooPedidoAdmin): string {
  const d = direccionPreferida(p) ?? p.billing;
  if (!d) return "—";
  const ciudad = (d.city ?? "").trim().toUpperCase();
  const depto = (d.state ?? "").trim().toUpperCase();
  const pais = (d.country ?? "").trim().toUpperCase();
  const partes = [ciudad, depto].filter(Boolean);
  if (pais && pais !== "UY" && pais !== "URUGUAY") {
    partes.push(pais);
  }
  return partes.length ? partes.join(" · ") : "—";
}

function telefonoDestinatario(p: WooPedidoAdmin): string {
  const d = direccionPreferida(p);
  const t = d?.phone?.trim() || p.billing?.phone?.trim();
  return t || "—";
}

function fechaEtiqueta(raw: string | undefined): string {
  if (!raw?.trim()) return "—";
  const fecha = raw.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return raw;
  const hora = raw.length >= 16 ? raw.slice(11, 16) : "";
  return hora ? `${m[3]}/${m[2]}/${m[1]} ${hora}` : `${m[3]}/${m[2]}/${m[1]}`;
}

export function etiquetaPedidoFileName(pedido: WooPedidoAdmin): string {
  return `etiqueta-casa-miguel-${pedido.number ?? pedido.id}.pdf`;
}

export function EtiquetaEnvioDocument({ pedido }: { pedido: WooPedidoAdmin }) {
  const idPedido = pedido.number ?? String(pedido.id);
  const nota = pedido.customer_note?.trim() || "—";

  return (
    <Document>
      <Page size="A6" style={estilos.page}>
        <View style={estilos.cuerpo}>
          <View style={estilos.filaCabecera}>
            <View style={estilos.filaLogo}>
              <PdfImage src={ETIQUETA_CASA_MIGUEL_LOGO_URL} style={estilos.logo} />
              <Text style={estilos.marcaTexto}>Casa Miguel</Text>
            </View>
            <View>
              <Text style={estilos.remitente}>Casa Miguel - Montevideo, Uruguay</Text>
            </View>
          </View>

          <View style={estilos.cajaDestinatario}>
            <Text style={estilos.tituloDestinatario}>DESTINATARIO</Text>
            <Text style={estilos.nombreCompleto}>{nombreDestinatario(pedido)}</Text>
            {lineasDireccion(pedido).map((linea, i) => (
              <Text key={i} style={estilos.direccion}>
                {linea}
              </Text>
            ))}
            <Text style={estilos.ciudadDepto}>{ciudadYDepartamento(pedido)}</Text>
            <Text style={estilos.telefono}>Tel. {telefonoDestinatario(pedido)}</Text>
          </View>
        </View>

        <View style={estilos.footer}>
          <Text style={estilos.footerEtiqueta}>
            Pedido WooCommerce #{idPedido} · {fechaEtiqueta(pedido.date_created || pedido.date_created_gmt)}
          </Text>
          <Text style={estilos.observacionesTitulo}>Observaciones</Text>
          <Text style={estilos.observacionesCuerpo}>{nota}</Text>
        </View>
      </Page>
    </Document>
  );
}

