import { Request, Response } from "express";
import { prisma } from "../config/db";
import getNextSequenceValue from "../services/secuenceService";
import { calculateInvoiceTotals, InvoiceLineInput } from "../services/invoiceCalc";
import { requireOrganizationId } from "../config/tenantContext";

const invoiceInclude = {
  items: true,
  customer: true,
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

// Crear una factura en DRAFT (sin number; conceptos libres de servicios).
const createInvoice = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { customerId, items, dueDate, notes } = req.body;

    const customer = await prisma.customer.findFirst({
      where: { id: customerId },
    });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const { items: calculatedItems, subtotal, taxAmount, totalAmount } =
      calculateInvoiceTotals(items as InvoiceLineInput[]);

    const invoice = await prisma.invoice.create({
      data: {
        organizationId,
        customerId,
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
    const { customerId, items, dueDate, notes } = req.body;

    const existing = await prisma.invoice.findFirst({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (existing.status !== "DRAFT") {
      return res
        .status(409)
        .json({ message: "Solo se pueden editar facturas en estado DRAFT" });
    }

    const { items: calculatedItems, subtotal, taxAmount, totalAmount } =
      calculateInvoiceTotals(items as InvoiceLineInput[]);

    const invoice = await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      await tx.invoice.updateMany({
        where: { id },
        data: {
          customerId: customerId ?? existing.customerId,
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
  markAsPaid,
  cancelInvoice,
};
