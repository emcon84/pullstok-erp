import { Request, Response } from "express";
import { prisma } from "../config/db";
import getNextSequenceValue from "../services/secuenceService";
import { requireOrganizationId } from "../config/tenantContext";

// Crear una nueva cotización
const createQuotation = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { customer, products, totalAmount, validUntil } = req.body;

    // Numeración por tipo: presupuesto (PRE-) y su remito asociado (REM-).
    const quotationSeq = await getNextSequenceValue(organizationId, "quotation");
    const quotationNumber = `PRE-${quotationSeq.toString().padStart(4, "0")}`;
    const receiptSeq = await getNextSequenceValue(organizationId, "receipt");
    const receiptNumber = `REM-${receiptSeq.toString().padStart(4, "0")}`;

    const newQuotation = await prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.create({
        data: {
          organizationId,
          customerId: customer,
          totalAmount,
          validUntil: new Date(validUntil),
          receipt: quotationNumber,
          items: {
            create: products.map((p: any) => ({
              productId: p.product,
              quantity: p.quantity,
              price: p.price,
            })),
          },
        },
        include: {
          items: { include: { product: true } },
          customer: true,
        },
      });

      await tx.receipt.create({
        data: {
          organizationId,
          type: "invoice",
          relatedDocument: quotation.id,
          receiptNumber,
        },
      });

      return quotation;
    });

    res.status(201).json(newQuotation);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Obtener todas las cotizaciones (scopeado por org)
const getQuotations = async (_req: Request, res: Response) => {
  try {
    const quotations = await prisma.quotation.findMany({
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });
    res.status(200).json(quotations);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener una cotización por ID
const getQuotationById = async (req: Request, res: Response) => {
  try {
    const quotation = await prisma.quotation.findFirst({
      where: { id: req.params.id },
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });
    if (quotation) {
      res.status(200).json(quotation);
    } else {
      res.status(404).json({ message: "Quotation not found" });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar una cotización
const updateQuotation = async (req: Request, res: Response) => {
  try {
    const { products, totalAmount, validUntil } = req.body;
    const id = req.params.id;

    // Verificar que la cotización pertenezca a la organización del usuario.
    const existing = await prisma.quotation.findFirst({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Quotation not found" });
    }

    const quotation = await prisma.$transaction(async (tx) => {
      await tx.quotationItem.deleteMany({ where: { quotationId: id } });

      await tx.quotation.updateMany({
        where: { id },
        data: {
          totalAmount,
          validUntil: new Date(validUntil),
        },
      });

      await tx.quotationItem.createMany({
        data: products.map((p: any) => ({
          quotationId: id,
          productId: p.product,
          quantity: p.quantity,
          price: p.price,
        })),
      });

      return tx.quotation.findFirst({
        where: { id },
        include: { items: { include: { product: true } } },
      });
    });

    res.status(200).json(quotation);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Eliminar un presupuesto (es una cotización: no toca stock)
const deleteQuotation = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = await prisma.quotation.findFirst({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Quotation not found" });
    }
    // Desvincular pedidos que referencian este presupuesto (FK).
    await prisma.order.updateMany({
      where: { quotationId: id },
      data: { quotationId: null },
    });
    // Los items se borran en cascada (onDelete: Cascade).
    await prisma.quotation.deleteMany({ where: { id } });
    await prisma.receipt.deleteMany({ where: { relatedDocument: id } });
    res.status(200).json({ message: "Presupuesto eliminado correctamente" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export default {
  createQuotation,
  getQuotations,
  getQuotationById,
  updateQuotation,
  deleteQuotation,
};
