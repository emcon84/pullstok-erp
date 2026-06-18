import { Request, Response } from 'express';
import { prisma } from '../config/db';
import getNextSequenceValue from '../services/secuenceService';

// Crear una nueva cotización
const createQuotation = async (req: Request, res: Response) => {
    try {
        const { customer, products, totalAmount, validUntil } = req.body;

        // Obtener el siguiente número secuencial para el comprobante
        const sequenceNumber = await getNextSequenceValue('receipt');
        const receiptNumber = sequenceNumber.toString().padStart(4, '0');

        // Crear la cotización con sus items
        const newQuotation = await prisma.quotation.create({
            data: {
                customerId: customer,
                totalAmount,
                validUntil: new Date(validUntil),
                receipt: receiptNumber,
                items: {
                    create: products.map((p: any) => ({
                        productId: p.product,
                        quantity: p.quantity,
                        price: p.price
                    }))
                }
            },
            include: {
                items: {
                    include: {
                        product: true
                    }
                },
                customer: true
            }
        });

        // Crear un comprobante para el presupuesto
        await prisma.receipt.create({
            data: {
                type: 'invoice',
                relatedDocument: newQuotation.id,
                receiptNumber
            }
        });

        res.status(201).json(newQuotation);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

// Obtener todas las cotizaciones
const getQuotations = async (req: Request, res: Response) => {
    try {
        const quotations = await prisma.quotation.findMany({
            include: {
                customer: true,
                items: {
                    include: {
                        product: true
                    }
                }
            }
        });
        res.status(200).json(quotations);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Obtener una cotización por ID
const getQuotationById = async (req: Request, res: Response) => {
    try {
        const quotation = await prisma.quotation.findUnique({
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
        if (quotation) {
            res.status(200).json(quotation);
        } else {
            res.status(404).json({ message: 'Quotation not found' });
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Actualizar una cotización
const updateQuotation = async (req: Request, res: Response) => {
    try {
        const { products, totalAmount, validUntil } = req.body;
        
        // Eliminar items anteriores
        await prisma.quotationItem.deleteMany({
            where: { quotationId: req.params.id }
        });

        // Actualizar la cotización con nuevos items
        const quotation = await prisma.quotation.update({
            where: { id: req.params.id },
            data: {
                totalAmount,
                validUntil: new Date(validUntil),
                items: {
                    create: products.map((p: any) => ({
                        productId: p.product,
                        quantity: p.quantity,
                        price: p.price
                    }))
                }
            },
            include: {
                items: {
                    include: {
                        product: true
                    }
                }
            }
        });

        res.status(200).json(quotation);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export default {
    createQuotation,
    getQuotations,
    getQuotationById,
    updateQuotation
};
