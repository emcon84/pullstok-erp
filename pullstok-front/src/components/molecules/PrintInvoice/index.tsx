import { useMemo } from "react";
import type { InvoicePdfData } from "@/utils/exportToPDF";
import type { AfipQrPayload } from "@/utils/afipQr";
import { useAfipQrImage } from "@/components/hooks/useAfipQrImage";
import logoUrl from "@/assets/logo-vertical.png";

/**
 * Comprobante de factura IMPRIMIBLE (patrón print-area + window.print).
 *
 * Diseño tomado del HTML/CSS de referencia que el usuario entregó
 * (gemini-code-1787353351555.html, Factura C AFIP):
 * - Tarjeta 780px con borde 1px negro.
 * - Franja ORIGINAL centrada.
 * - Header: recuadro con la letra (position absolute, centrado, abierto
 *   arriba) + línea divisoria central que baja + columnas emisor/comprobante.
 * - Nombre del emisor 22px bold centrado.
 * - Sección cliente en 2 columnas (55/45).
 * - Tabla de ítems con header #e6e6e6.
 * - Totales con Pagos a la izquierda e Importe Total a la derecha.
 * - Footer: QR + AFIP (itálica 20px) | CAE Nro + Fecha Vto CAE.
 */
const MISSING_LABEL = "(sin datos fiscales)";
const FISCAL_LEGEND = "Comprobante Autorizado";
const NON_FISCAL_LEGEND = "Comprobante no fiscal — no válido como factura ARCA";

const fiscalField = (value?: string | null) =>
  value && value.trim() ? value : MISSING_LABEL;

/** Normaliza una fecha a DD/MM/YYYY. */
const formatDate = (value?: string | null): string => {
  if (!value) return "-";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
};

/** Fecha visible → YYYY-MM-DD para el JSON del QR AFIP. */
const toIsoDate = (value?: string | null): string => {
  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? "");
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (iso) return value as string;
  const parsed = value ? new Date(value) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
};

/** Número fiscal "0002-00000013". */
const fiscalNumber = (data: InvoicePdfData): string | null =>
  data.puntoVenta != null && data.cbteNro != null
    ? `${String(data.puntoVenta).padStart(4, "0")}-${String(data.cbteNro).padStart(8, "0")}`
    : null;

const comprobanteTitle = (data: InvoicePdfData): string =>
  data.tipoComprobante === "1"
    ? "FACTURA A"
    : data.tipoComprobante === "6"
      ? "FACTURA B"
      : (data.title || "FACTURA").toUpperCase();

const comprobanteLetter = (data: InvoicePdfData): string =>
  data.tipoComprobante === "1" ? "A" : data.tipoComprobante === "6" ? "B" : "";

const formatMoney = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "-"
    : `$ ${Number(n).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

/** Formato "fac-C-00003-00000325". */
const comprobanteRef = (data: InvoicePdfData): string => {
  const letter = comprobanteLetter(data) || "X";
  const num = fiscalNumber(data) ?? data.documentNumber ?? "-";
  return `fac-${letter}-${num}`;
};

/** Payload del QR fiscal AFIP (RG 4892/2020). */
const buildAfipQrPayload = (data: InvoicePdfData): AfipQrPayload => {
  const cuitDigits = data.issuer?.taxId?.replace(/\D/g, "") ?? "";
  const docNroDigits = data.docNroReceptor?.replace(/\D/g, "") ?? "";
  return {
    fecha: toIsoDate(data.date),
    cuit: cuitDigits ? Number(cuitDigits) : NaN,
    ptoVta: data.puntoVenta ?? NaN,
    tipoCmp: data.tipoComprobante ? Number(data.tipoComprobante) : NaN,
    nroCmp: data.cbteNro ?? NaN,
    importe: data.total,
    tipoDocRec: data.docTipoReceptor ?? undefined,
    nroDocRec: docNroDigits ? Number(docNroDigits) : undefined,
    codAut: data.cae ? Number(data.cae) : NaN,
  };
};

export const PrintInvoice = (data: InvoicePdfData) => {
  const hasCae = Boolean(data.cae);
  const qrPayload = useMemo(
    () => (data.cae ? buildAfipQrPayload(data) : null),
    [data],
  );
  const qrDataUrl = useAfipQrImage(qrPayload);

  const tableRows: Array<InvoicePdfData["items"][number] | null> = [
    ...data.items,
  ];
  while (tableRows.length < 6) tableRows.push(null);

  return (
    <div className="print-area print-invoice-area hidden print:block" aria-hidden="true">
      <div className="factura-card" style={styles.card}>
        {/* Franja ORIGINAL */}
        <div style={styles.original}>ORIGINAL</div>

        {/* Header Principal */}
        <div style={styles.headerMain}>
          {/* Recuadro con la letra (centrado, abierto arriba) */}
          <div data-testid="print-invoice-letter" style={styles.letraBox}>
            {comprobanteLetter(data)}
          </div>
          {/* Línea divisoria central */}
          <div style={styles.lineaCentral} />

          <div style={styles.headerColumns}>
            {/* Emisor */}
            <div style={styles.colEmisor}>
              <img
                src={logoUrl}
                alt="Logo"
                data-testid="print-invoice-logo"
                style={{ ...styles.logo, marginBottom: 16 }}
              />
              <div style={styles.rowInfo}>
                {fiscalField(data.issuer?.address)}
              </div>
              {/* Localidad: sin dato separado por ahora */}
              <div style={styles.rowInfo}>
                {fiscalField(data.issuer?.taxCondition)}
              </div>
            </div>

            {/* Comprobante */}
            <div style={styles.colComprobante}>
              <div style={styles.tipoComprobante}>{comprobanteTitle(data)}</div>
              <div style={styles.rowInfo}>
                {fiscalNumber(data) ?? comprobanteRef(data)}
              </div>
              <div style={styles.rowInfo}>
                <span style={styles.lbl}>Fecha de Emisión:</span> {formatDate(data.date)}
              </div>
              <br />
              <div style={styles.rowInfo}>
                <span style={styles.lbl}>CUIT:</span> {fiscalField(data.issuer?.taxId)}
              </div>
              <div style={styles.rowInfo}>
                <span style={styles.lbl}>Ingresos Brutos:</span>{" "}
                {fiscalField(data.issuer?.ingresosBrutos)}
              </div>
              <div style={styles.rowInfo}>
                <span style={styles.lbl}>Inicio de Actividades:</span>{" "}
                {fiscalField(data.issuer?.inicioActividades)}
              </div>
            </div>
          </div>
        </div>

        {/* Cliente */}
        <div style={styles.clienteSection}>
          <div style={{ width: "55%" }}>
            <div style={styles.rowInfo}>
              <span style={styles.lbl}>Cliente:</span> {data.customer || MISSING_LABEL}
            </div>
            <div style={{ ...styles.rowInfo, marginTop: 8 }}>
              <span style={styles.lbl}>Domicilio:</span>{" "}
              {fiscalField(data.customerAddress)}
            </div>
          </div>
          <div style={{ width: "45%" }}>
            <div style={styles.rowInfo}>
              <span style={styles.lbl}>CUIT/DNI:</span> {fiscalField(data.customerTaxId)}
            </div>
            <div style={{ ...styles.rowInfo, marginTop: 8 }}>
              <span style={styles.lbl}>Condición IVA:</span>{" "}
              {fiscalField(data.customerTaxCondition)}
            </div>
          </div>
        </div>

        {/* Tabla de ítems — flex:1 para que llene el alto de la hoja */}
        <div style={styles.tableArea}>
          <table style={styles.table}>
            <thead>
            <tr>
              <th style={{ ...styles.th, width: "10%" }}>Código</th>
              <th style={{ ...styles.th, width: "35%" }}>Descripción</th>
              <th style={{ ...styles.th, width: "10%", textAlign: "right" }}>Cantidad</th>
              <th style={{ ...styles.th, width: "12%", textAlign: "right" }}>Precio Unit</th>
              <th style={{ ...styles.th, width: "11%", textAlign: "right" }}>Descuento</th>
              <th style={{ ...styles.th, width: "11%", textAlign: "right" }}>Alícuota %</th>
              <th style={{ ...styles.th, width: "11%", textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((item, index) =>
              item ? (
                <tr key={index}>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>{item.name}</td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    {item.quantity.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    {formatMoney(item.price)}
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>$ 0.00</td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    {item.taxRate !== undefined
                      ? `${item.taxRate.toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      : "-"}
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    {formatMoney(item.total)}
                  </td>
                </tr>
              ) : (
                <tr key={`empty-${index}`}>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>&nbsp;</td>
                </tr>
              ),
            )}
          </tbody>
          </table>
        </div>

        {/* Totales */}
        <div style={styles.totales}>
          <div style={styles.pagosInfo}>
            Pagos
            <br />
            <span style={{ fontWeight: "normal", fontSize: 10 }}>
              Efectivo {formatMoney(data.total)}
            </span>
            {data.subtotal !== undefined && (
              <>
                <br />
                <span style={{ fontWeight: "normal", fontSize: 10 }}>
                  Subtotal: {formatMoney(data.subtotal)}
                </span>
              </>
            )}
            {data.taxAmount !== undefined && (
              <>
                <br />
                <span style={{ fontWeight: "normal", fontSize: 10 }}>
                  IVA: {formatMoney(data.taxAmount)}
                </span>
              </>
            )}
          </div>
          <div style={styles.totalMonto}>
            Importe Total: {formatMoney(data.total)}
          </div>
        </div>

        {/* Footer AFIP */}
        {hasCae ? (
          <div style={styles.afipFooter}>
            <div style={styles.qrAfipContainer}>
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Código QR ARCA"
                  data-testid="print-invoice-qr"
                  style={styles.qrImg}
                />
              ) : (
                <span
                  data-testid="print-invoice-cae-fallback"
                  style={styles.qrFallback}
                >
                  {data.cae}
                </span>
              )}
              <div>
                <div style={styles.afipLogoText}>ARCA</div>
                <div style={{ fontSize: 9 }}>{FISCAL_LEGEND}</div>
              </div>
            </div>
            <div style={styles.caeInfo}>
              <div>
                <span style={styles.lbl}>CAE Nro:</span> {data.cae}
              </div>
              <div>
                <span style={styles.lbl}>Fecha Vto CAE:</span>{" "}
                {formatDate(data.caeVencimiento)}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ ...styles.afipFooter, justifyContent: "center" }}>
            <span style={{ fontSize: 11, fontWeight: "bold" }}>
              {NON_FISCAL_LEGEND}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  card: {
    width: "100%",
    minHeight: "272mm",
    margin: "0 auto",
    backgroundColor: "#fff",
    border: "1px solid #000",
    boxSizing: "border-box",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: 11,
    color: "#000",
    display: "flex",
    flexDirection: "column",
  } as const,
  original: {
    textAlign: "center" as const,
    fontWeight: "bold" as const,
    fontSize: 12,
    padding: "4px 0",
    borderBottom: "1px solid #000",
    letterSpacing: 1,
  },
  headerMain: {
    position: "relative" as const,
    borderBottom: "1px solid #000",
    minHeight: 180,
  },
  letraBox: {
    position: "absolute" as const,
    top: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: 60,
    height: 60,
    borderLeft: "1px solid #000",
    borderRight: "1px solid #000",
    borderBottom: "1px solid #000",
    backgroundColor: "#fff",
    textAlign: "center" as const,
    fontSize: 32,
    fontWeight: "bold" as const,
    lineHeight: "56px",
    zIndex: 2,
  },
  lineaCentral: {
    position: "absolute" as const,
    top: 60,
    left: "50%",
    bottom: 0,
    width: 1,
    backgroundColor: "#000",
    zIndex: 1,
  },
  headerColumns: {
    display: "flex" as const,
    width: "100%",
  },
  colEmisor: {
    width: "50%",
    padding: "15px 20px 10px 15px",
    textAlign: "center" as const,
  },
  colComprobante: {
    width: "50%",
    padding: "15px 15px 10px 40px",
  },
  tipoComprobante: {
    fontSize: 16,
    fontWeight: "bold" as const,
    marginBottom: 12,
    marginLeft: 20,
  },
  rowInfo: {
    marginBottom: 5,
    lineHeight: 1.3,
  },
  lbl: {
    fontWeight: "bold" as const,
    display: "inline-block" as const,
  },
  logo: {
    height: 48,
    width: "auto",
    maxWidth: "100%",
    objectFit: "contain" as const,
  },
  clienteSection: {
    borderBottom: "1px solid #000",
    padding: "8px 15px",
    display: "flex" as const,
    flexWrap: "wrap" as const,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
  },
  /* Envuelve la tabla de ítems y la estira para llenar el alto de la hoja,
     empujando los totales y el footer al final del A4. */
  tableArea: {
    flex: 1,
    display: "flex" as const,
    flexDirection: "column" as const,
  },
  th: {
    borderBottom: "1px solid #000",
    borderTop: "1px solid #000",
    backgroundColor: "#e6e6e6",
    padding: "4px 6px",
    textAlign: "left" as const,
    fontWeight: "bold" as const,
  },
  td: {
    padding: "4px 6px",
    verticalAlign: "top" as const,
  },
  totales: {
    borderTop: "2px solid #000",
    borderBottom: "2px solid #000",
    padding: "8px 15px",
    display: "flex" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
  },
  pagosInfo: {
    fontWeight: "bold" as const,
  },
  totalMonto: {
    fontSize: 14,
    fontWeight: "bold" as const,
  },
  afipFooter: {
    padding: 15,
    display: "flex" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  qrAfipContainer: {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 15,
  },
  qrImg: {
    width: 80,
    height: 80,
  },
  qrFallback: {
    width: 80,
    height: 80,
    border: "1px solid #ccc",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    fontSize: 9,
    color: "#666",
    textAlign: "center" as const,
    wordBreak: "break-all" as const,
  },
  afipLogoText: {
    fontWeight: "bold" as const,
    fontSize: 20,
    letterSpacing: -1,
    fontStyle: "italic" as const,
  },
  caeInfo: {
    textAlign: "right" as const,
    lineHeight: 1.5,
  },
};

export default PrintInvoice;