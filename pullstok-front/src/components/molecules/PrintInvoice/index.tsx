import { useMemo } from "react";
import type { InvoicePdfData } from "@/utils/exportToPDF";
import type { AfipQrPayload } from "@/utils/afipQr";
import { useAfipQrImage } from "@/components/hooks/useAfipQrImage";

/**
 * Comprobante de factura IMPRIMIBLE (patrón print-area + window.print que ya
 * usa el proyecto en PrintPriceList/PrintProductList/PrintBulkPriceList).
 *
 * Layout estándar AFIP/ARCA según el modelo ASCII que definió el usuario:
 * marco exterior completo, franja ORIGINAL, header en 3 columnas separadas
 * (emisor | recuadro con la letra A/B | datos del comprobante), fila del
 * cliente en 2 columnas, tabla de 7 columnas con filas vacías de relleno,
 * fila de pagos con Importe Total, y footer con QR AFIP + CAE.
 *
 * Los campos que el modelo muestra y que aún no existen en el modelo de datos
 * (Ingresos Brutos, Fecha Inicio Actividades, Localidad, Código de producto,
 * Descuento) se renderizan vacíos o se omiten si no vienen — sin agregar
 * schema. Cuando esos datos existan, se completan en los mismos lugares.
 */
const MISSING_LABEL = "(sin datos fiscales)";
const FISCAL_LEGEND = "Comprobante Autorizado";
const NON_FISCAL_LEGEND = "Comprobante no fiscal — no válido como factura AFIP";

const fiscalField = (value?: string | null) =>
  value && value.trim() ? value : MISSING_LABEL;

/** Normaliza una fecha a DD/MM/YYYY (acepta ISO, Date-parseable o ya
 * formateada). Si no puede parsearse, devuelve el valor crudo. */
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

/** Convierte una fecha visible al formato YYYY-MM-DD que exige el JSON del
 * QR fiscal AFIP. Si no puede derivarse, usa la fecha actual. */
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

/** Número fiscal visible "0002-00000013" (puntoVenta 4 díg. + cbteNro 8 díg.). */
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

/** Formato "fac-C-00003-00000325" del ejemplo (o el número fiscal simple). */
const comprobanteRef = (data: InvoicePdfData): string => {
  const letter = comprobanteLetter(data) || "X";
  const num = fiscalNumber(data) ?? data.documentNumber ?? "-";
  return `fac-${letter}-${num}`;
};

/** Arma el payload del QR fiscal AFIP (RG 4892/2020). Con CAE presente pero
 * datos inválidos (ej. emisor sin CUIT), buildAfipQrUrl lanza y el canvas se
 * omite → fallback a CAE como texto. */
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

  // Rellenar la tabla con filas vacías hasta mínimo 5 (look de factura real).
  const minRows = 5;
  const tableRows: Array<InvoicePdfData["items"][number] | null> = [
    ...data.items,
  ];
  while (tableRows.length < minRows) tableRows.push(null);

  return (
    <div className="print-area hidden print:block" aria-hidden="true">
      <div className="mx-auto max-w-3xl border-2 border-black text-xs leading-relaxed">
        {/* Franja ORIGINAL */}
        <div className="border-b-2 border-black py-1 text-center">
          <span className="text-xs font-bold tracking-[0.35em]">ORIGINAL</span>
        </div>

        {/* Header 3 columnas separadas por bordes */}
        <div className="grid grid-cols-[1fr_auto_1fr]">
          {/* Emisor */}
          <div className="border-r-2 border-black p-3">
            {data.logoUrl && (
              <img
                src={data.logoUrl}
                alt="Logo"
                data-testid="print-invoice-logo"
                className="mb-2 h-12 w-auto max-w-full object-contain"
              />
            )}
            <p className="text-sm font-bold uppercase">
              {fiscalField(data.issuer?.name)}
            </p>
            <p>Razón Social: {fiscalField(data.issuer?.name)}</p>
            <p>Domicilio: {fiscalField(data.issuer?.address)}</p>
            {/* Localidad: no existe como campo separado; se omite si no hay */}
            <p>Condición IVA: {fiscalField(data.issuer?.taxCondition)}</p>
          </div>

          {/* Recuadro con la letra del comprobante */}
          <div className="flex w-16 items-center justify-center border-r-2 border-black p-2">
            <span
              data-testid="print-invoice-letter"
              className="text-[32px] font-bold leading-none"
            >
              ({comprobanteLetter(data)})
            </span>
          </div>

          {/* Datos del comprobante */}
          <div className="p-3 text-right">
            <p className="text-sm font-bold uppercase">
              {comprobanteTitle(data)}
            </p>
            <p>Comprobante: {comprobanteRef(data)}</p>
            <p>Fecha Emisión: {formatDate(data.date)}</p>
            <p>CUIT: {fiscalField(data.issuer?.taxId)}</p>
            {/* Ingresos Brutos / Fecha Inicio Actividades: sin dato por ahora */}
            {data.issuer?.taxId ? (
              <p>Ingresos Brutos: {fiscalField(data.issuer.taxId)}</p>
            ) : null}
          </div>
        </div>

        {/* Fila del cliente */}
        <div className="grid grid-cols-2 border-t-2 border-black">
          <div className="border-r-2 border-black p-3">
            <p>
              <span className="font-bold">Cliente:</span>{" "}
              {data.customer || MISSING_LABEL}
            </p>
            <p>
              <span className="font-bold">Domicilio:</span>{" "}
              {fiscalField(data.customerAddress)}
            </p>
          </div>
          <div className="p-3">
            <p>
              <span className="font-bold">CUIT/DNI:</span>{" "}
              {fiscalField(data.customerTaxId)}
            </p>
            <p>
              <span className="font-bold">Condición IVA:</span>{" "}
              {fiscalField(data.customerTaxCondition)}
            </p>
          </div>
        </div>

        {/* Tabla de items (7 columnas) */}
        <table className="w-full border-collapse border-t-2 border-black">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 text-left font-bold uppercase">
                Código
              </th>
              <th className="border border-black px-2 py-1 text-left font-bold uppercase">
                Descripción
              </th>
              <th className="border border-black px-2 py-1 text-right font-bold uppercase">
                Cantidad
              </th>
              <th className="border border-black px-2 py-1 text-right font-bold uppercase">
                Precio Unit
              </th>
              <th className="border border-black px-2 py-1 text-right font-bold uppercase">
                Descuento
              </th>
              <th className="border border-black px-2 py-1 text-right font-bold uppercase">
                Alícuota %
              </th>
              <th className="border border-black px-2 py-1 text-right font-bold uppercase">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((item, index) =>
              item ? (
                <tr key={index}>
                  <td className="border border-black px-2 py-1 tabular-nums">
                    {/* Código de producto: sin dato por ahora */}
                  </td>
                  <td className="border border-black px-2 py-1">{item.name}</td>
                  <td className="border border-black px-2 py-1 text-right tabular-nums">
                    {item.quantity.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="border border-black px-2 py-1 text-right tabular-nums">
                    {formatMoney(item.price)}
                  </td>
                  <td className="border border-black px-2 py-1 text-right tabular-nums">
                    $ 0.00
                  </td>
                  <td className="border border-black px-2 py-1 text-right tabular-nums">
                    {item.taxRate !== undefined
                      ? `${item.taxRate.toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      : "-"}
                  </td>
                  <td className="border border-black px-2 py-1 text-right tabular-nums">
                    {formatMoney(item.total)}
                  </td>
                </tr>
              ) : (
                <tr key={`empty-${index}`}>
                  <td className="border border-black px-2 py-1">&nbsp;</td>
                  <td className="border border-black px-2 py-1">&nbsp;</td>
                  <td className="border border-black px-2 py-1">&nbsp;</td>
                  <td className="border border-black px-2 py-1">&nbsp;</td>
                  <td className="border border-black px-2 py-1">&nbsp;</td>
                  <td className="border border-black px-2 py-1">&nbsp;</td>
                  <td className="border border-black px-2 py-1">&nbsp;</td>
                </tr>
              ),
            )}
          </tbody>
        </table>

        {/* Fila de pagos / totales */}
        <div className="grid grid-cols-2 border-t-2 border-black">
          <div className="border-r-2 border-black p-3">
            <p className="font-bold">Pagos</p>
            <p>Efectivo {formatMoney(data.total)}</p>
          </div>
          <div className="p-3 text-right">
            {data.subtotal !== undefined && (
              <p>
                Subtotal: <span className="tabular-nums">{formatMoney(data.subtotal)}</span>
              </p>
            )}
            {data.taxAmount !== undefined && (
              <p>
                IVA: <span className="tabular-nums">{formatMoney(data.taxAmount)}</span>
              </p>
            )}
            <p className="font-bold">
              Importe Total:{" "}
              <span className="tabular-nums">{formatMoney(data.total)}</span>
            </p>
          </div>
        </div>

        {/* Footer CAE */}
        {hasCae ? (
          <div className="grid grid-cols-2 border-t-2 border-black">
            <div className="flex items-center gap-2 border-r-2 border-black p-3">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Código QR AFIP"
                  data-testid="print-invoice-qr"
                  className="h-20 w-20 shrink-0"
                />
              ) : (
                <span
                  data-testid="print-invoice-cae-fallback"
                  className="w-20 shrink-0 break-all text-center text-xl font-bold leading-tight"
                >
                  {data.cae}
                </span>
              )}
              <div>
                <p className="font-bold">AFIP</p>
                <p>{FISCAL_LEGEND}</p>
                <p className="mt-1 text-[10px]">
                  Verificá este comprobante en www.afip.gob.ar/fe/qr
                </p>
              </div>
            </div>
            <div className="p-3 text-right">
              <p>
                <span className="font-bold">CAE Nro:</span>{" "}
                <span className="tabular-nums">{data.cae}</span>
              </p>
              <p>
                <span className="font-bold">Fecha Vto CAE:</span>{" "}
                {formatDate(data.caeVencimiento)}
              </p>
            </div>
          </div>
        ) : (
          <p className="border-t-2 border-black p-3 text-center text-xs">
            {NON_FISCAL_LEGEND}
          </p>
        )}
      </div>
    </div>
  );
};

export default PrintInvoice;