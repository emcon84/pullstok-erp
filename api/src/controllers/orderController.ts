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

    // Numeración por tipo: el pedido tiene su serie (PED-) y el remito la suya (REM-).
    const orderSeq = await getNextSequenceValue(organizationId, "order");
    const orderNumber = `PED-${orderSeq.toString().padStart(4, "0")}`;
    const receiptSeq = await getNextSequenceValue(organizationId, "receipt");
    const receiptNumber = `REM-${receiptSeq.toString().padStart(4, "0")}`;

    // El pedido es un BORRADOR editable: NO toca stock. Solo la venta descuenta
    // inventario. Por eso un pedido se puede editar/borrar libremente.
    const newOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          organizationId,
          customerId: customer,
          totalAmount: totalAmount || (quotation ? quotation.totalAmount : 0),
          status: "PENDING",
          type: isSale ? "SALE" : "PURCHASE",
          quotationId: quotationId || null,
          receipt: orderNumber,
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

// Update an order's items (un pedido es borrador: no toca stock al editar)
const updateOrder = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const { products, totalAmount, customer } = req.body;

    const existing = await prisma.order.findFirst({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.order.updateMany({
        where: { id },
        data: {
          totalAmount,
          ...(customer ? { customerId: customer } : {}),
        },
      });
      await tx.orderItem.createMany({
        data: products.map(
          (p: { productId: string; quantity: number; price: number }) => ({
            orderId: id,
            productId: p.productId,
            quantity: p.quantity,
            price: p.price,
          }),
        ),
      });
      return tx.order.findFirst({
        where: { id },
        include: { items: { include: { product: true } }, customer: true },
      });
    });

    res.status(200).json(order);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Delete an order (es un borrador: no toca stock, se puede borrar)
const deleteOrder = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = await prisma.order.findFirst({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Order not found" });
    }
    // Los items se borran en cascada (onDelete: Cascade en el schema).
    await prisma.order.deleteMany({ where: { id } });
    await prisma.receipt.deleteMany({ where: { relatedDocument: id } });
    res.status(200).json({ message: "Pedido eliminado correctamente" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export default {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  updateOrder,
  deleteOrder,
};
