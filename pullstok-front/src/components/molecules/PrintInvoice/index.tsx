import { useMemo } from "react";
import type { InvoicePdfData } from "@/utils/exportToPDF";
import type { AfipQrPayload } from "@/utils/afipQr";
import { useAfipQrImage } from "@/components/hooks/useAfipQrImage";

/**
 * Comprobante de factura IMPRIMIBLE (patrón print-area + window.print que ya
 * usa el proyecto en PrintPriceList/PrintProductList/PrintBulkPriceList).
 * Layout de factura estándar AFIP/ARCA en HTML/CSS Tailwind:
 *
 *   1. Rótulo "ORIGINAL" centrado arriba.
 *   2. Header en 3 columnas: emisor (izq, con logo opcional) — recuadro con
 *      la letra del comprobante A/B (centro) — "FACTURA A/B" + número fiscal
 *      puntoVenta-cbteNro + fecha de emisión + punto de venta (der).
 *   3. Receptor: Cliente, CUIT, Condición IVA, Domicilio.
 *   4. Tabla de items: Cantidad | Descripción | Precio Unit. | IVA % | Subtotal.
 *   5. Totales a la derecha: Subtotal, IVA, Total.
 *   6. Zona CAE (solo si la factura tiene CAE): recuadro con CAE, vencimiento,
 *      código QR fiscal AFIP (imagen <img> generada en canvas local vía
 *      useAfipQrImage) y leyenda "Comprobante autorizado por ARCA". Sin
 *      canvas disponible, el CAE se muestra como texto grande en el mismo
 *      recuadro (fallback igual que el PDF histórico).
 *   7. Sin CAE: leyenda "Comprobante no fiscal" al pie.
 *
 * El layout lo maneja Tailwind (flexbox/grid/espaciados) — sin coordenadas
 * manuales. Se monta SIEMPRE en el DOM con `hidden print:block` y solo se
 * ve en @media print (ver index.css); el botón simplemente dispara
 * window.print().
 */
const MISSING_LABEL = "(sin datos fiscales)";
const FISCAL_LEGEND = "Comprobante autorizado por ARCA";
const NON_FISCAL_LEGEND = "Comprobante no fiscal — no válido como factura AFIP";

const fiscalField = (value?: string | null) =>
  value && value.trim() ? value : MISSING_LABEL;

/** Normaliza una fecha a DD/MM/YYYY (acepta ISO, Date-parseable o ya
 * formateada). Si no puede parsearse, devuelve el valor crudo. */
const formatDate = (value?: string | null): string => {
  if (!value) return "-";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }
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

const formatMoney = (n: number) =>
  `$ ${Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

  return (
    <div className="print-area hidden print:block" aria-hidden="true">
      <div className="mx-auto max-w-3xl text-sm leading-relaxed">
        {/* Rótulo ORIGINAL, centrado arriba de todo */}
        <div className="mb-3 flex justify-center">
          <div className="border border-black px-10 py-0.5 text-center">
            <span className="text-xs font-bold tracking-[0.25em]">ORIGINAL</span>
          </div>
        </div>

        {/* Header fiscal en 3 columnas: emisor | letra | tipo+número+fecha */}
        <div className="mb-4 flex items-stretch gap-4">
          <div className="min-w-0 flex-1">
            {data.logoUrl && (
              <img
                src={data.logoUrl}
                alt="Logo"
                data-testid="print-invoice-logo"
                className="mb-2 h-14 w-auto max-w-full object-contain"
              />
            )}
            <p className="font-bold uppercase">{fiscalField(data.issuer?.name)}</p>
            <p>CUIT: {fiscalField(data.issuer?.taxId)}</p>
            <p>Condición IVA: {fiscalField(data.issuer?.taxCondition)}</p>
            <p>Domicilio: {fiscalField(data.issuer?.address)}</p>
          </div>

          {/* Recuadro con la letra del comprobante (A/B) */}
          <div className="flex w-20 shrink-0 items-center justify-center border-2 border-black">
            <span className="text-[40px] font-bold leading-none">
              {comprobanteLetter(data)}
            </span>
          </div>

          <div className="min-w-0 flex-1 text-right">
            <p className="text-base font-bold uppercase">{comprobanteTitle(data)}</p>
            <p className="text-sm font-bold">
              {fiscalNumber(data) ?? data.documentNumber}
            </p>
            <p>Fecha de emisión: {formatDate(data.date)}</p>
            {data.puntoVenta != null && (
              <p>
                Punto de venta: {String(data.puntoVenta).padStart(4, "0")}
              </p>
            )}
          </div>
        </div>

        <div className="mb-4 border-t border-black" />

        {/* Receptor */}
        <div className="mb-4">
          <p className="font-bold">Cliente: {data.customer || MISSING_LABEL}</p>
          <p>CUIT: {fiscalField(data.customerTaxId)}</p>
          <p>Condición IVA: {fiscalField(data.customerTaxCondition)}</p>
          <p>Domicilio: {fiscalField(data.customerAddress)}</p>
        </div>

        {/* Tabla de items */}
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-black bg-gray-200 px-2 py-1 text-left text-xs font-bold uppercase">
                Cantidad
              </th>
              <th className="border border-black bg-gray-200 px-2 py-1 text-left text-xs font-bold uppercase">
                Descripción
              </th>
              <th className="border border-black bg-gray-200 px-2 py-1 text-right text-xs font-bold uppercase">
                Precio Unit.
              </th>
              <th className="border border-black bg-gray-200 px-2 py-1 text-right text-xs font-bold uppercase">
                IVA %
              </th>
              <th className="border border-black bg-gray-200 px-2 py-1 text-right text-xs font-bold uppercase">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="border border-black px-2 py-6 text-center">
                  Sin ítems.
                </td>
              </tr>
            )}
            {data.items.map((item, index) => (
              <tr key={index}>
                <td className="border border-black px-2 py-1 text-center tabular-nums">
                  {item.quantity}
                </td>
                <td className="border border-black px-2 py-1">{item.name}</td>
                <td className="border border-black px-2 py-1 text-right tabular-nums">
                  {formatMoney(item.price)}
                </td>
                <td className="border border-black px-2 py-1 text-right tabular-nums">
                  {item.taxRate !== undefined ? `${item.taxRate}%` : "-"}
                </td>
                <td className="border border-black px-2 py-1 text-right tabular-nums">
                  {formatMoney(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales a la derecha */}
        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1">
            {data.subtotal !== undefined && (
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatMoney(data.subtotal)}</span>
              </div>
            )}
            {data.taxAmount !== undefined && (
              <div className="flex justify-between">
                <span>IVA</span>
                <span className="tabular-nums">{formatMoney(data.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-black pt-1 font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(data.total)}</span>
            </div>
          </div>
        </div>

        {/* Zona CAE (solo comprobante fiscal) o leyenda no fiscal */}
        {hasCae ? (
          <div className="mt-6 flex items-center gap-4 border border-black p-3">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Código QR AFIP"
                data-testid="print-invoice-qr"
                className="h-24 w-24 shrink-0"
              />
            ) : (
              <span
                data-testid="print-invoice-cae-fallback"
                className="w-24 shrink-0 break-all text-center text-2xl font-bold leading-tight"
              >
                {data.cae}
              </span>
            )}
            <div className="text-xs">
              <p className="font-bold">CAE: {data.cae}</p>
              <p>Vencimiento CAE: {formatDate(data.caeVencimiento)}</p>
              <p className="mt-2 font-bold">{FISCAL_LEGEND}</p>
              <p>Verificá este comprobante en www.afip.gob.ar/fe/qr</p>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-center text-xs">{NON_FISCAL_LEGEND}</p>
        )}
      </div>
    </div>
  );
};

export default PrintInvoice;