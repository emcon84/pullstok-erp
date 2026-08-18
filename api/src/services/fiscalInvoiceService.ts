// Orquestación de la emisión fiscal ARCA (sdd/arca-facturacion-electronica).
//
// Regla crítica (design D5): el SOAP NUNCA corre dentro de un $transaction
// largo. El flujo usa transacciones CORTAS (reserva de correlativo +
// PENDING_CAE) y la llamada a ARCA (FECAESolicitar, timeout 30 s) FUERA de la
// transacción, para no mantener locks/conexiones durante una llamada de red.
//
// Estados (design D5):
//   DRAFT ──issue()──► ISSUED interno (FAC-XXXX, cae=null)
//     │  ARCA habilitada → emitirFiscalmente (si falla queda ISSUED sin CAE)
//     ▼
//   emitirFiscalmente ──reserva cbteNro (tx)──► PENDING_CAE
//     ──FECAESolicitar (SOAP fuera de tx)──► ISSUED fiscal (CAE + número)
//     fallo → PENDING_CAE + arcaError (reintento, MISMO cbteNro)
//   NUNCA se llega a ISSUED con CAE sin haber obtenido el CAE (spec 4.4).
//
// El servicio recibe el ArcaClient inyectado (ArcaClientMock en tests, homo en
// prod) y el ArcaAuthContext (lo que vive en ArcaSetting: cuit, PV, ambiente,
// rutas de cert). El ArcaClientMock es un doble real en memoria → unit tests
// sin red.

import { prisma, basePrisma } from "../config/db";
import {
  calcArcaAmounts,
  deriveReceptorFiscal,
  type ArcaLineInput,
} from "./arcaCalc";
import { ArcaError, ARCA_ERROR_CODES } from "../integrations/arca/types";
import type {
  ArcaAuthContext,
  ArcaClient,
  CaeRequest,
} from "../integrations/arca/types";
import { toZonedTime } from "date-fns-tz";

const AR_TZ = "America/Argentina/Buenos_Aires";

/** Fecha del comprobante en AR (America/Argentina/Buenos_Aires) como YYYYMMDD. */
const arDate = (): string => {
  const z = toZonedTime(new Date(), AR_TZ);
  const yyyy = z.getFullYear();
  const mm = String(z.getMonth() + 1).padStart(2, "0");
  const dd = String(z.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
};

/** "YYYYMMDD" → Date (fecha de vencimiento del CAE). */
const parseArcaDate = (s: string): Date => {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  return new Date(y, m, d);
};

interface InvoiceWithRelations {
  id: string;
  status: string;
  cae: string | null;
  caeVencimiento: Date | null;
  cbteNro: number | null;
  customer?: { taxId?: string | null } | null;
  items: { quantity: number; unitPrice: number; taxRate: number }[];
}

const asArcaLine = (items: InvoiceWithRelations["items"]): ArcaLineInput[] =>
  items.map((i) => ({
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    taxRate: i.taxRate,
  }));

const buildCaeRequest = (
  invoice: InvoiceWithRelations,
  ctx: ArcaAuthContext,
  cbteNro: number,
  tipoCbte: "1" | "6",
  receptor: { docTipo: number; docNro: string; condicionIvaReceptorId: number },
): CaeRequest => {
  const amounts = calcArcaAmounts(asArcaLine(invoice.items));
  return {
    cuitEmisor: ctx.cuitEmisor,
    puntoVenta: ctx.puntoVenta,
    tipoCbte: Number(tipoCbte),
    cbteNro,
    fechaEmision: arDate(),
    importeNeto: amounts.netoCents,
    importeExento: amounts.exentoCents,
    importeIva: amounts.ivaCents,
    importeTotal: amounts.totalCents,
    porAlicuota: amounts.porAlicuota.map((a) => ({
      tasa: a.tasa,
      baseImpCents: a.baseImpCents,
      importeCents: a.importeCents,
    })),
    docTipoReceptor: receptor.docTipo,
    docNroReceptor: receptor.docNro,
    condicionIvaReceptorId: receptor.condicionIvaReceptorId,
  };
};

const asArcaError = (err: unknown): { code: string; message: string } => {
  if (err instanceof ArcaError) {
    return { code: err.code, message: err.message };
  }
  return { code: ARCA_ERROR_CODES.ARCA_NETWORK_ERROR, message: String((err as Error)?.message ?? err) };
};

/**
 * Emite fiscalmente una Invoice ISSUED interno (sin CAE) contra ARCA.
 * - Deja la factura en PENDING_CAE con el correlativo reservado ANTES del SOAP.
 * - Corre FECAESolicitar FUERA de la transacción.
 * - Éxito → ISSUED con CAE + número fiscal; fallo → PENDING_CAE + arcaError.
 */
export const emitirFiscalmente = async (
  invoiceId: string,
  client: ArcaClient,
  ctx: ArcaAuthContext,
) => {
  const setting = await basePrisma.arcaSetting.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  if (!setting || !setting.enabled) {
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_NOT_CONFIGURED,
      "ARCA no configurado para la organización",
      400,
    );
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId },
    include: { items: true, customer: true },
  });
  if (!invoice) {
    throw new ArcaError(ARCA_ERROR_CODES.INVOICE_NOT_FOUND, "Factura no encontrada", 404);
  }

  // Guardas de estado (design D5, paso 1).
  if (invoice.cae && invoice.caeVencimiento) {
    if (invoice.caeVencimiento.getTime() < Date.now()) {
      throw new ArcaError(ARCA_ERROR_CODES.CAE_VENCIDO, "CAE vencido", 409);
    }
    throw new ArcaError(ARCA_ERROR_CODES.INVOICE_ALREADY_ISSUED, "Factura ya emitida fiscalmente", 409);
  }
  if (invoice.status === "PENDING_CAE") {
    throw new ArcaError(
      ARCA_ERROR_CODES.INVALID_INVOICE_STATE,
      "La factura está en PENDING_CAE; usá retry-fiscal con el mismo correlativo",
      409,
    );
  }
  if (invoice.status !== "ISSUED") {
    throw new ArcaError(
      ARCA_ERROR_CODES.INVALID_INVOICE_STATE,
      "Solo se pueden emitir fiscalmente facturas ISSUED sin CAE",
      409,
    );
  }

  return emitirCore(invoice, client, ctx, { allowPending: false });
};

/**
 * Reintenta la emisión fiscal de una factura en PENDING_CAE.
 * REUTILIZA el correlativo ya reservado (spec 4.4.2 / 2.2): no vuelve a llamar
 * a FECompUltimoAutorizado.
 */
export const reintentarFiscalmente = async (
  invoiceId: string,
  client: ArcaClient,
  ctx: ArcaAuthContext,
) => {
  const setting = await basePrisma.arcaSetting.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  if (!setting || !setting.enabled) {
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_NOT_CONFIGURED,
      "ARCA no configurado para la organización",
      400,
    );
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId },
    include: { items: true, customer: true },
  });
  if (!invoice) {
    throw new ArcaError(ARCA_ERROR_CODES.INVOICE_NOT_FOUND, "Factura no encontrada", 404);
  }

  // Reintento solo desde PENDING_CAE (ya tiene correlativo reservado).
  if (invoice.status !== "PENDING_CAE") {
    throw new ArcaError(
      ARCA_ERROR_CODES.INVALID_INVOICE_STATE,
      "Solo se puede reintentar una factura en PENDING_CAE",
      409,
    );
  }

  return emitirCore(invoice, client, ctx, { allowPending: true });
};

const emitirCore = async (
  invoice: any,
  client: ArcaClient,
  ctx: ArcaAuthContext,
  opts: { allowPending: boolean },
) => {
  // Derivación del receptor (spec 5.4): CUIT inválido NO avanza.
  const derived = deriveReceptorFiscal(invoice.customer?.taxId);
  if (!derived.ok) {
    throw new ArcaError(
      ARCA_ERROR_CODES.CUIT_INVALIDO,
      "El CUIT del cliente es inválido; no se puede emitir la factura fiscal",
      400,
    );
  }
  const receptor = derived.receptor;
  const tipoCbte = receptor.docTipo === 80 ? "1" : "6";

  // Correlativo: reusar el reservado; si no, reservar vía FECompUltimoAutorizado.
  let cbteNro = invoice.cbteNro as number | null;
  if (cbteNro == null) {
    const last = await client.getLastInvoiceNumber({
      puntoVenta: ctx.puntoVenta,
      tipoCbte: Number(tipoCbte),
    });
    cbteNro = last + 1;
  }

  // Tx CORTA: reserva correlativo ANTES del SOAP + PENDING_CAE (spec 4.1).
  await prisma.$transaction(async (tx) => {
    await tx.invoice.updateMany({
      where: { id: invoice.id },
      data: {
        status: "PENDING_CAE",
        cbteNro,
        puntoVenta: ctx.puntoVenta,
        tipoComprobante: tipoCbte,
        docTipoReceptor: receptor.docTipo,
        docNroReceptor: receptor.docNro,
        condicionIvaReceptorId: receptor.condicionIvaReceptorId,
      },
    });
    await basePrisma.arcaSequence.upsert({
      where: {
        organizationId_puntoVenta_tipoCbte: {
          organizationId: ctx.organizationId,
          puntoVenta: ctx.puntoVenta,
          tipoCbte,
        },
      },
      update: { lastReserved: cbteNro },
      create: {
        organizationId: ctx.organizationId,
        puntoVenta: ctx.puntoVenta,
        tipoCbte,
        lastReserved: cbteNro,
      },
    });
  });

  // SOAP FUERA de la transacción (timeout ≥ 30 s + retry en la capa).
  const caeReq = buildCaeRequest(invoice, ctx, cbteNro, tipoCbte, receptor);

  let result;
  try {
    result = await client.requestCAE(caeReq);
  } catch (err) {
    const { code, message } = asArcaError(err);
    await prisma.invoice.updateMany({
      where: { id: invoice.id },
      data: {
        status: "PENDING_CAE",
        arcaErrorCode: code,
        arcaErrorMessage: message,
        arcaAttempts: { increment: 1 },
      },
    });
    throw err;
  }

  // Éxito → tx corta: ISSUED con CAE + limpieza de error (nunca ISSUED sin CAE).
  await prisma.invoice.updateMany({
    where: { id: invoice.id },
    data: {
      status: "ISSUED",
      cae: result.cae,
      caeVencimiento: parseArcaDate(result.caeVencimiento),
      arcaErrorCode: null,
      arcaErrorMessage: null,
    },
  });

  return prisma.invoice.findFirst({
    where: { id: invoice.id },
    include: { items: true, customer: true },
  });
};
