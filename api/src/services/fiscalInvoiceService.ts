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

import { Prisma } from "@prisma/client";
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
  customer?: { taxId?: string | null; taxCondition?: string | null } | null;
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
 * Resuelve el punto de venta efectivo al emitir (sdd/sucursales-pv-facturacion,
 * R2/R5/R6/R8/R10). Cadena de precedencia:
 *   invoice.puntoVenta (snapshot congelado) ?? branch.puntoVenta ?? casaCentral.puntoVenta ?? orgDefaultPv
 *
 * - El snapshot (invoice.puntoVenta) devuelve frozen PRIMERO y NUNCA re-resuelve
 *   (R5/R6: el reintento reutiliza el MISMO PV, aunque la config cambie).
 * - Branch está en TENANT_MODELS (db.ts) → prisma.branch.findFirst recibe el
 *   organizationId inyectado por la extensión → anti-fuga cross-sucursal (R10).
 * - Casa central (isHeadquarters=true) es el fallback del branch sin PV (R2).
 * - Sin casa central → PV global de ArcaSetting (orgDefaultPv) (R2-E3).
 */
export const resolvePuntoVenta = async (
  invoice: { branchId?: string | null; puntoVenta?: number | null },
  orgDefaultPv: number,
): Promise<number> => {
  // Snapshot congelado: si ya hay PV persisted en la invoice, es la verdad.
  if (invoice.puntoVenta != null) {
    return invoice.puntoVenta;
  }

  if (invoice.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: invoice.branchId } });
    if (branch?.puntoVenta != null) {
      return branch.puntoVenta;
    }
  }

  const casaCentral = await prisma.branch.findFirst({
    where: { isHeadquarters: true },
  });
  if (casaCentral?.puntoVenta != null) {
    return casaCentral.puntoVenta;
  }

  return orgDefaultPv;
};

/**
 * Reserva el correlativo fiscal de forma ATÓMICA vía ArcaSequence
 * (fix-correlativo-race). ArcaSequence es el source of truth del número de
 * comprobante por (org, puntoVenta, tipoCbte).
 *
 * - Primera vez que no existe la fila: se inicializa `lastReserved` desde el
 *   último número usado en AFIP (`getLastInvoiceNumber`), para no colisionar
 *   con comprobantes ya emitidos (bootstrap/reconciliación).
 * - Después: solo incrementa. El `UPDATE ... RETURNING` es atómico por fila,
 *   por lo que dos emisiones concurrentes (misma org+PV+tipo) obtienen valores
 *   DISTINTOS → nunca dos facturas con el mismo cbteNro.
 *
 * Regla D5: esto NO corre SOAP dentro de una transacción DB. Solo se llama a
 * ARCA en el bootstrap (creación de la fila), fuera de cualquier lock largo.
 */
const reservarCorrelativo = async (
  orgId: string,
  pv: number,
  tipoCbte: string,
  client: ArcaClient,
): Promise<number> => {
  // 1. Asegurar la fila del contador. Si se creó ahora (INSERT afectó 1 fila),
  //    inicializar desde el último número usado en AFIP.
  const inserted = await basePrisma.$executeRaw(Prisma.sql`
    INSERT INTO arca_sequences (id, "organizationId", "puntoVenta", "tipoCbte", "lastReserved", "updatedAt")
    VALUES (gen_random_uuid(), ${orgId}, ${pv}, ${tipoCbte}, 0, now())
    ON CONFLICT ("organizationId", "puntoVenta", "tipoCbte") DO NOTHING
  `);
  if (inserted > 0) {
    const last = await client.getLastInvoiceNumber({
      puntoVenta: pv,
      tipoCbte: Number(tipoCbte),
    });
    await basePrisma.$executeRaw(Prisma.sql`
      UPDATE arca_sequences SET "lastReserved" = ${last}, "updatedAt" = now()
      WHERE "organizationId" = ${orgId} AND "puntoVenta" = ${pv} AND "tipoCbte" = ${tipoCbte}
    `);
  }

  // 2. Incremento atómico + RETURNING (siempre). Única fuente del número.
  const rows = await basePrisma.$queryRaw<{ lastReserved: number }[]>(Prisma.sql`
    UPDATE arca_sequences
    SET "lastReserved" = "lastReserved" + 1, "updatedAt" = now()
    WHERE "organizationId" = ${orgId} AND "puntoVenta" = ${pv} AND "tipoCbte" = ${tipoCbte}
    RETURNING "lastReserved"
  `);
  const next = rows[0]?.lastReserved;
  if (next == null) {
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_NETWORK_ERROR,
      "No se pudo reservar el correlativo fiscal",
      500,
    );
  }
  return next;
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
  // Se pasa la condición IVA real del cliente para Factura B con DNI (deuda
  // técnica item 3: antes quedaba hardcodeada a 5 = Consumidor Final).
  const derived = deriveReceptorFiscal(
    invoice.customer?.taxId,
    invoice.customer?.taxCondition,
  );
  if (!derived.ok) {
    throw new ArcaError(
      ARCA_ERROR_CODES.CUIT_INVALIDO,
      "El CUIT del cliente es inválido; no se puede emitir la factura fiscal",
      400,
    );
  }
  const receptor = derived.receptor;
  const tipoCbte = receptor.docTipo === 80 ? "1" : "6";

  // PV efectivo (sdd/sucursales-pv-facturacion R2/R5): el snapshot congelado
  // de la Invoice manda; si no, la cadena branch ?? casaCentral ?? orgDefault.
  // El reintento SIEMPRE usa el snapshot (invoice.puntoVenta) — nunca re-resuelve.
  const pv = await resolvePuntoVenta(invoice, ctx.puntoVenta);
  // Contexto con el PV efectivo para el SOAP y el request CAE (D2).
  const ctxPv = { ...ctx, puntoVenta: pv };

  // Correlativo: reusar el reservado (reintento); si no, reservarlo ATÓMICAMENTE
  // vía ArcaSequence (fix-correlativo-race). Ya NO se usa `last + 1` (era un
  // read-modify-write sin lock → race condition).
  let cbteNro = invoice.cbteNro as number | null;
  if (cbteNro == null) {
    cbteNro = await reservarCorrelativo(
      ctx.organizationId,
      pv,
      tipoCbte,
      client,
    );
  }

  // Tx CORTA: persiste PENDING_CAE + número reservado ANTES del SOAP (spec 4.1).
  // El contador ya se incrementó en reservarCorrelativo, así que acá NO se
  // vuelve a tocar arca_sequences (sería redundante y no atómico).
  await prisma.$transaction(async (tx) => {
    await tx.invoice.updateMany({
      where: { id: invoice.id },
      data: {
        status: "PENDING_CAE",
        cbteNro,
        puntoVenta: pv,
        tipoComprobante: tipoCbte,
        docTipoReceptor: receptor.docTipo,
        docNroReceptor: receptor.docNro,
        condicionIvaReceptorId: receptor.condicionIvaReceptorId,
      },
    });
  });

  // SOAP FUERA de la transacción (timeout ≥ 30 s + retry en la capa).
  const caeReq = buildCaeRequest(invoice, ctxPv, cbteNro, tipoCbte, receptor);

  let result;
  try {
    result = await client.requestCAE(caeReq);
  } catch (err) {
    const { code, message } = asArcaError(err);

    // Design D5 paso 6: si el comprobante ya se autorizó en AFIP (timeout tras
    // procesarse), recuperamos el CAE vía FECompConsultar en lugar de dejar la
    // factura en PENDING_CAE permanente.
    if (code === ARCA_ERROR_CODES.ARCA_ALREADY_AUTHORIZED) {
      const consulta = await client.consultarComprobante({
        puntoVenta: pv,
        tipoCbte: Number(tipoCbte),
        cbteNro,
      });
      if (consulta?.cae) {
        await prisma.invoice.updateMany({
          where: { id: invoice.id },
          data: {
            status: "ISSUED",
            cae: consulta.cae,
            caeVencimiento: parseArcaDate(consulta.caeVencimiento),
            arcaErrorCode: null,
            arcaErrorMessage: null,
          },
        });
        return prisma.invoice.findFirst({
          where: { id: invoice.id },
          include: { items: true, customer: true },
        });
      }
    }

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
