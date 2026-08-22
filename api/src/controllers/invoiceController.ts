import { Request, Response } from "express";
import { prisma, basePrisma } from "../config/db";
import getNextSequenceValue from "../services/secuenceService";
import { calculateInvoiceTotals, InvoiceLineInput } from "../services/invoiceCalc";
import { requireOrganizationId } from "../config/tenantContext";
import {
  emitirFiscalmente,
  reintentarFiscalmente,
} from "../services/fiscalInvoiceService";
import { createArcaClientHomo } from "../integrations/arca/arcaClient";
import { ArcaError } from "../integrations/arca/types";
import type { ArcaAuthContext } from "../integrations/arca/types";

const invoiceInclude = {
  items: true,
  customer: true,
  branch: true,
} as const;

// Deriva paymentStatus=OVERDUE en LECTURA cuando dueDate ya pasó y sigue
// PENDING. PAID es absorbente: nunca se deriva sobre un pago ya registrado.
// No se persiste (sin cron, sin escritura) — es puro cálculo de respuesta.
const withDerivedPaymentStatus = <T extends { dueDate: Date | null; paymentStatus: string }>(
  invoice: T,
): T => {
  if (
    invoice.paymentStatus === "PENDING" &&
    invoice.dueDate &&
    invoice.dueDate.getTime() < Date.now()
  ) {
    return { ...invoice, paymentStatus: "OVERDUE" };
  }
  return invoice;
};

// --- ARCA: contexto + cliente homo (sdd/arca-facturacion-electronica) ---

const buildArcaContext = (setting: any, organizationId: string): ArcaAuthContext => ({
  organizationId,
  cuitEmisor: setting.cuitEmisor,
  puntoVenta: setting.puntoVenta,
  environment: setting.environment,
  certPath: setting.certPath,
  keyPath: setting.keyPath,
});

/** ¿El gate ARCA está habilitado para la org? (fila + enabled + campos completos). */
const isArcaEnabled = (setting: any): boolean =>
  !!setting &&
  setting.enabled === true &&
  !!setting.cuitEmisor &&
  setting.puntoVenta != null &&
  !!setting.certPath &&
  !!setting.keyPath;

// Crear una factura en DRAFT (sin number; conceptos libres de servicios).
const createInvoice = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { customerId, items, dueDate, notes, branchId } = req.body;

    const customer = await prisma.customer.findFirst({
      where: { id: customerId },
    });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Sucursal emisora (sdd/sucursales-pv-facturacion R3, opcional). Si viene,
    // validar que exista en la org (la extensión multi-tenant scopea Branch) →
    // branchId inexistente/de otra org → 404 (anti-fuga R10). null = fallback.
    if (branchId != null) {
      const branch = await prisma.branch.findFirst({ where: { id: branchId } });
      if (!branch) {
        return res.status(404).json({ message: "Sucursal no encontrada" });
      }
    }

    const { items: calculatedItems, subtotal, taxAmount, totalAmount } =
      calculateInvoiceTotals(items as InvoiceLineInput[]);

    const invoice = await prisma.invoice.create({
      data: {
        organizationId,
        customerId,
        branchId: branchId ?? null,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        notes,
        subtotal,
        taxAmount,
        totalAmount,
        items: {
          create: calculatedItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            lineTotal: item.lineTotal,
          })),
        },
      },
      include: invoiceInclude,
    });

    res.status(201).json(withDerivedPaymentStatus(invoice));
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Listar facturas de la org (con paymentStatus derivado por factura).
const getInvoices = async (_req: Request, res: Response) => {
  try {
    const invoices = await prisma.invoice.findMany({
      include: invoiceInclude,
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(invoices.map(withDerivedPaymentStatus));
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener una factura por ID (scopeada por org).
const getInvoiceById = async (req: Request, res: Response) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id },
      include: invoiceInclude,
    });
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    res.status(200).json(withDerivedPaymentStatus(invoice));
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Editar una factura — SOLO permitido en DRAFT (ISSUED es inmutable salvo
// paymentStatus, que tiene su propio endpoint markAsPaid).
const updateInvoice = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const { customerId, items, dueDate, notes, branchId } = req.body;

    const existing = await prisma.invoice.findFirst({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (existing.status !== "DRAFT") {
      return res
        .status(409)
        .json({ message: "Solo se pueden editar facturas en estado DRAFT" });
    }

    // Sucursal emisora (opcional). Validar existencia si viene un valor concreto.
    if (branchId != null) {
      const branch = await prisma.branch.findFirst({ where: { id: branchId } });
      if (!branch) {
        return res.status(404).json({ message: "Sucursal no encontrada" });
      }
    }

    const { items: calculatedItems, subtotal, taxAmount, totalAmount } =
      calculateInvoiceTotals(items as InvoiceLineInput[]);

    const invoice = await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      await tx.invoice.updateMany({
        where: { id },
        data: {
          customerId: customerId ?? existing.customerId,
          branchId: branchId ?? existing.branchId,
          dueDate: dueDate ? new Date(dueDate) : existing.dueDate,
          notes: notes ?? existing.notes,
          subtotal,
          taxAmount,
          totalAmount,
        },
      });

      await tx.invoiceItem.createMany({
        data: calculatedItems.map((item) => ({
          invoiceId: id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          lineTotal: item.lineTotal,
        })),
      });

      return tx.invoice.findFirst({ where: { id }, include: invoiceInclude });
    });

    res.status(200).json(withDerivedPaymentStatus(invoice!));
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Borrar una factura — SOLO permitido en DRAFT (nunca tuvo number asignado).
const deleteInvoice = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = await prisma.invoice.findFirst({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (existing.status !== "DRAFT") {
      return res
        .status(400)
        .json({ message: "Solo se pueden borrar facturas en estado DRAFT" });
    }

    // Los InvoiceItem se borran en cascada (onDelete: Cascade).
    await prisma.invoice.deleteMany({ where: { id } });
    res.status(200).json({ message: "Factura eliminada correctamente" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Transición DRAFT → ISSUED: asigna number correlativo (Counter, por org) y
// fija issueDate. Atómico para que la numeración no tenga huecos si falla el
// update de status.
const issueInvoice = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const id = req.params.id;

    const invoice = await prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findFirst({
        where: { id, status: "DRAFT" },
        include: { items: true },
      });
      if (!existing) {
        return null;
      }
      if (existing.items.length === 0) {
        throw new Error("NO_ITEMS");
      }

      const seq = await getNextSequenceValue(organizationId, "invoice");
      const number = `FAC-${seq.toString().padStart(4, "0")}`;

      await tx.invoice.updateMany({
        where: { id },
        data: { number, status: "ISSUED", issueDate: new Date() },
      });

      return tx.invoice.findFirst({ where: { id }, include: invoiceInclude });
    });

    if (invoice === null) {
      return res
        .status(404)
        .json({ message: "Invoice not found or not in DRAFT status" });
    }

    // ARCA habilitada (design D5): encadena la emisión fiscal en el mismo
    // request. Si la emisión fiscal falla, la factura queda ISSUED interno sin
    // CAE (o PENDING_CAE) — el flujo interno no se rompe; se devuelve el error
    // fiscal adjunto para que el front ofrezca reintento (spec 6.1).
    const arcaSetting = await basePrisma.arcaSetting.findUnique({
      where: { organizationId },
    });
    if (isArcaEnabled(arcaSetting)) {
      const ctx = buildArcaContext(arcaSetting, organizationId);
      try {
        const fiscal = await emitirFiscalmente(
          invoice.id,
          createArcaClientHomo(ctx),
          ctx,
        );
        return res.status(200).json(withDerivedPaymentStatus(fiscal!));
      } catch (error: any) {
        const fiscalError =
          error instanceof ArcaError
            ? { code: error.code, message: error.message }
            : { code: "ARCA_ERROR", message: error.message };
        const pending = await prisma.invoice.findFirst({
          where: { id: invoice.id },
          include: invoiceInclude,
        });
        return res
          .status(200)
          .json({ ...withDerivedPaymentStatus(pending!), fiscalError });
      }
    }

    res.status(200).json(withDerivedPaymentStatus(invoice!));
  } catch (error: any) {
    if (error.message === "NO_ITEMS") {
      return res
        .status(400)
        .json({ message: "No se puede emitir una factura sin ítems" });
    }
    res.status(400).json({ message: error.message });
  }
};

// Emisión fiscal explícita (PUT /:id/issue-fiscal). El gate checkArcaEnabled
// ya adjuntó req.arcaContext (ArcaAuthContext); acá se construye el cliente
// homo y se emite. Acepta ISSUED interno sin CAE.
const issueFiscal = async (req: Request, res: Response) => {
  try {
    const ctx = (req as Request & { arcaContext?: ArcaAuthContext }).arcaContext;
    if (!ctx) {
      return res.status(403).json({ error: "ARCA_NOT_AVAILABLE" });
    }
    const invoice = await emitirFiscalmente(
      req.params.id,
      createArcaClientHomo(ctx),
      ctx,
    );
    res.status(200).json(withDerivedPaymentStatus(invoice!));
  } catch (error: any) {
    if (error instanceof ArcaError) {
      return res
        .status(error.httpStatus)
        .json({ error: error.code, message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// Reintento de emisión fiscal (PUT /:id/retry-fiscal). Desde PENDING_CAE,
// reutiliza el MISMO correlativo reservado (spec 4.4.2/2.2).
const retryFiscal = async (req: Request, res: Response) => {
  try {
    const ctx = (req as Request & { arcaContext?: ArcaAuthContext }).arcaContext;
    if (!ctx) {
      return res.status(403).json({ error: "ARCA_NOT_AVAILABLE" });
    }
    const invoice = await reintentarFiscalmente(
      req.params.id,
      createArcaClientHomo(ctx),
      ctx,
    );
    res.status(200).json(withDerivedPaymentStatus(invoice!));
  } catch (error: any) {
    if (error instanceof ArcaError) {
      return res
        .status(error.httpStatus)
        .json({ error: error.code, message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// Marca la factura como cobrada. Solo aplica sobre ISSUED. PAID es
// absorbente: una vez pagada, no vuelve a PENDING/OVERDUE.
const markAsPaid = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = await prisma.invoice.findFirst({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (existing.status !== "ISSUED") {
      return res
        .status(400)
        .json({ message: "Solo se pueden cobrar facturas emitidas (ISSUED)" });
    }

    await prisma.invoice.updateMany({
      where: { id },
      data: { paymentStatus: "PAID" },
    });

    const invoice = await prisma.invoice.findFirst({
      where: { id },
      include: invoiceInclude,
    });
    res.status(200).json(withDerivedPaymentStatus(invoice!));
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Cancela una factura ISSUED. Conserva el number para trazabilidad (no se
// reutiliza ni se borra). DRAFT no se cancela, se borra (deleteInvoice).
const cancelInvoice = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = await prisma.invoice.findFirst({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (existing.status !== "ISSUED") {
      return res
        .status(400)
        .json({ message: "Solo se pueden cancelar facturas emitidas (ISSUED)" });
    }
    if (existing.cae != null) {
      return res
        .status(409)
        .json({ message: "No se puede cancelar una factura emitida fiscalmente con CAE" });
    }

    await prisma.invoice.updateMany({
      where: { id },
      data: { status: "CANCELLED" },
    });

    const invoice = await prisma.invoice.findFirst({
      where: { id },
      include: invoiceInclude,
    });
    res.status(200).json(withDerivedPaymentStatus(invoice!));
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export default {
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  issueInvoice,
  issueFiscal,
  retryFiscal,
  markAsPaid,
  cancelInvoice,
};
