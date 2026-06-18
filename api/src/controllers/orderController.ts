import { Request, Response } from 'express';
import { prisma } from '../config/db';
import getNextSequenceValue from '../services/secuenceService';

// Create a new order (sale or purchase)
const createOrder = async (req: Request, res: Response) => {
    try {
        const { customer, products, totalAmount, type, quotationId } = req.body;

        let quotation;
        if (quotationId) {
            quotation = await prisma.quotation.findUnique({
                where: { id: quotationId },
                include: { items: { include: { product: true } } }
            });
            if (!quotation) {
                return res.status(404).json({ message: 'Quotation not found' });
            }
        }

        const orderProducts = quotation
            ? quotation.items.map(p => ({
                productId: p.productId,
                quantity: p.quantity,
                price: p.price
            }))
            : products;

        // Verificar stock y actualizar cantidades
        for (const item of orderProducts) {
            const product = await prisma.product.findUnique({ where: { id: item.productId } });
            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            if (type === 'sale') {
                if (product.quantity < item.quantity) {
                    return res.status(400).json({ message: 'Insufficient stock' });
                }
                await prisma.product.update({
                    where: { id: item.productId },
                    data: { quantity: product.quantity - item.quantity }
                });
            } else if (type === 'purchase') {
                await prisma.product.update({
                    where: { id: item.productId },
                    data: { quantity: product.quantity + item.quantity }
                });
            }
        }

        // Obtener el siguiente número secuencial para el comprobante
        const sequenceNumber = await getNextSequenceValue('receipt');
        const receiptNumber = sequenceNumber.toString().padStart(4, '0');

        // Crear la orden con sus items
        const newOrder = await prisma.order.create({
            data: {
                customerId: customer,
                totalAmount: totalAmount || (quotation ? quotation.totalAmount : 0),
                status: 'PENDING',
                type: type === 'sale' ? 'SALE' : 'PURCHASE',
                quotationId: quotationId || null,
                receipt: receiptNumber,
                items: {
                    create: orderProducts.map((p: any) => ({
                        productId: p.productId,
                        quantity: p.quantity,
                        price: p.price
                    }))
                }
            },
            include: {
                items: true,
                customer: true
            }
        });

        // Crear un comprobante para la orden
        await prisma.receipt.create({
            data: {
                type: 'receipt',
                relatedDocument: newOrder.id,
                receiptNumber
            }
        });

        res.status(201).json(newOrder);
    } catch (error: any) {
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

// Get all orders
const getOrders = async (req: Request, res: Response) => {
    try {
        const orders = await prisma.order.findMany({
            include: {
                customer: true,
                items: {
                    include: {
                        product: true
                    }
                }
            }
        });
        res.status(200).json(orders);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Get a single order by ID
const getOrderById = async (req: Request, res: Response) => {
    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: {
                customer: true,
                items: {
                    include: {
                        product: true
                    }
                }
            }
        });
        if (order) {
            res.status(200).json(order);
        } else {
            res.status(404).json({ message: 'Order not found' });
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Update an order status
const updateOrderStatus = async (req: Request, res: Response) => {
    try {
        const { status } = req.body;
        const order = await prisma.order.update({
            where: { id: req.params.id },
            data: { status: status.toUpperCase() }
        });
        if (order) {
            res.status(200).json(order);
        } else {
            res.status(404).json({ message: 'Order not found' });
        }
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export default {
    createOrder,
    getOrders,
    getOrderById,
    updateOrderStatus
};
