import { Request, Response } from "express";
import { prisma } from "../config/db";
import getNextSequenceValue from "../services/secuenceService";
import { requireOrganizationId } from "../config/tenantContext";

// Create a new order (sale or purchase)
const createOrder = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { customer, products, totalAmount, type, quotationId } = req.body;
    const isSale = type === "sale";

    let quotation = null;
    if (quotationId) {
      quotation = await prisma.quotation.findFirst({
        where: { id: quotationId },
        include: { items: { include: { product: true } } },
      });
      if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }
    }

    const orderProducts: { productId: string; quantity: number; price: number }[] =
      quotation
        ? quotation.items.map((p) => ({
            productId: p.productId,
            quantity: p.quantity,
            price: p.price,
          }))
        : products;

    // Numeración del comprobante (por organización).
    const sequenceNumber = await getNextSequenceValue(organizationId, "receipt");
    const receiptNumber = sequenceNumber.toString().padStart(4, "0");

    // Todo en una transacción: stock + orden + comprobante son atómicos.
    const newOrder = await prisma.$transaction(async (tx) => {
      for (const item of orderProducts) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, organizationId },
        });
        if (!product) {
          throw new Error(`Producto ${item.productId} no encontrado`);
        }

        if (isSale) {
          const updated = await tx.product.updateMany({
            where: {
              id: item.productId,
              organizationId,
              quantity: { gte: item.quantity },
            },
            data: { quantity: { decrement: item.quantity } },
          });
          if (updated.count === 0) {
            throw new Error(`Stock insuficiente para ${product.name}`);
          }
        } else {
          await tx.product.updateMany({
            where: { id: item.productId, organizationId },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }

      const order = await tx.order.create({
        data: {
          organizationId,
          customerId: customer,
          totalAmount: totalAmount || (quotation ? quotation.totalAmount : 0),
          status: "PENDING",
          type: isSale ? "SALE" : "PURCHASE",
          quotationId: quotationId || null,
          receipt: receiptNumber,
          items: {
            create: orderProducts.map((p) => ({
              productId: p.productId,
              quantity: p.quantity,
              price: p.price,
            })),
          },
        },
        include: { items: true, customer: true },
      });

      await tx.receipt.create({
        data: {
          organizationId,
          type: "receipt",
          relatedDocument: order.id,
          receiptNumber,
        },
      });

      return order;
    });

    res.status(201).json(newOrder);
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

// Get all orders (scopeado por org)
const getOrders = async (_req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });
    res.status(200).json(orders);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Get a single order by ID
const getOrderById = async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id },
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });
    if (order) {
      res.status(200).json(order);
    } else {
      res.status(404).json({ message: "Order not found" });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Update an order status
const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const result = await prisma.order.updateMany({
      where: { id: req.params.id },
      data: { status: status.toUpperCase() },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Order not found" });
    }
    const order = await prisma.order.findFirst({
      where: { id: req.params.id },
    });
    res.status(200).json(order);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export default {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
};
