import { Request, Response } from 'express';
import SaleService from '../services/salesService';
import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { calculateInvoiceTotals, InvoiceLineInput } from "../services/invoiceCalc";

// Include estándar de Invoice (mismo shape que invoiceController).
const invoiceInclude = {
  items: true,
  customer: true,
} as const;

// Create a new sale
const createSale = async (req: Request, res: Response) => {
    try {
        const saleRequest = req.body;
        const sale = await SaleService.createSale(saleRequest);
        res.status(201).json(sale);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

// Get all sales
const getAllSales = async (req: Request, res: Response) => {
    try {
        const sales = await SaleService.getAllSales();
        res.status(200).json(sales);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Get a single sale by ID
const getSaleById = async (req: Request, res: Response) => {
    try {
        const sale = await SaleService.getSaleById(req.params.id);
        if (sale) {
            res.status(200).json(sale);
        } else {
            res.status(404).json({ message: 'Sale not found' });
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Crea una Invoice DRAFT a partir de una Sale existente (bridge Sale→Invoice).
// Ruta: POST /api/sales/:saleId/invoice (salesRoutes, no invoiceRoutes para
// no heredar el router.use de checkInvoicingEnabled).
const createInvoiceFromSale = async (req: Request, res: Response) => {
    try {
        const organizationId = requireOrganizationId();
        const { saleId } = req.params;
        const { customerId, dueDate, notes } = req.body;

        // Buscar la venta scoped a la org (la extensión de prisma inyecta
        // organizationId automáticamente en TENANT_MODELS; la Sale de otra org
        // no matchea y devuelve null → 404, que es el comportamiento correcto
        // para multi-tenant).
        const sale = await prisma.sale.findFirst({
            where: { id: saleId },
            include: { items: true, invoice: true },
        });
        if (!sale) {
            return res.status(404).json({ message: "Sale not found" });
        }

        // Idempotencia: si ya tiene factura, no crear otra.
        if (sale.invoice) {
            return res.status(409).json({ error: "SALE_ALREADY_INVOICED" });
        }

        // Validar que el customer existe y pertenece a la org (la extensión
        // también scopa Customer, así que un customerId de otra org → null).
        const customer = await prisma.customer.findFirst({
            where: { id: customerId },
        });
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        // Mapear SaleItem → InvoiceLineInput. taxRate fijo 21% en v1.
        // SaleItem.quantity es Int en el schema; number en TS es compatible.
        const lines: InvoiceLineInput[] = sale.items.map((item) => ({
            description: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            taxRate: 21,
        }));

        const { items: calculatedItems, subtotal, taxAmount, totalAmount } =
            calculateInvoiceTotals(lines);

        const invoice = await prisma.invoice.create({
            data: {
                organizationId,
                customerId,
                saleId,
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

        res.status(201).json(invoice);
    } catch (error: any) {
        // Race condition: dos requests simultáneos crean factura de la misma
        // venta → la DB rechaza con P2002 por @unique en Invoice.saleId.
        if (error.code === "P2002") {
            return res.status(409).json({ error: "SALE_ALREADY_INVOICED" });
        }
        res.status(400).json({ message: error.message });
    }
};

export default {
    createSale,
    getAllSales,
    getSaleById,
    createInvoiceFromSale,
};
