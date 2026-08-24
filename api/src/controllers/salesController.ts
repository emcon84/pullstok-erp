import { Request, Response } from 'express';
import SaleService from '../services/salesService';
import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { calculateInvoiceTotals, InvoiceLineInput } from "../services/invoiceCalc";
import { AuthedRequest } from "../middlewares/authMiddleware";

// Include estándar de Invoice (mismo shape que invoiceController).
const invoiceInclude = {
  items: true,
  customer: true,
  branch: true,
} as const;

// Create a new sale
const createSale = async (req: AuthedRequest, res: Response) => {
    try {
        const { products, orderId, payments, cashSessionId, discountPct } = req.body;
        const sale = await SaleService.createSale({ products, orderId, payments, cashSessionId, discountPct }, req.user!.id, req.user!.role);
        res.status(201).json(sale);
    } catch (error: any) {
        // 422 para errores de dominio del flujo suelto (B-06 amendment /
        // B-08 / loose-lines-stock): el payload es válido pero la operación no
        // se puede materializar (producto sin línea en la planilla, requiere
        // sucursal, stock suelto insuficiente, ...).
        if (typeof error?.code === "string" && error.code.startsWith("LOOSE_")) {
            return res.status(422).json({ error: error.code, message: error.message });
        }
        // Gate de caja (sdd/caja-apertura-cierre R9): el operativo no tiene una
        // caja OPEN en su sucursal → 422 (payload válido, operación bloqueada).
        if (error?.code === "CASH_SESSION_REQUIRED") {
            return res.status(422).json({ error: error.code, message: error.message });
        }
        // Payments que no cuadran con el total (R7) → 400.
        if (error?.code === "PAYMENTS_DO_NOT_MATCH_TOTAL") {
            return res.status(400).json({ error: error.code, message: error.message });
        }
        res.status(400).json({ message: error.message });
    }
};

// Get all sales
const getAllSales = async (req: Request, res: Response) => {
    try {
        const branchId = req.query.branchId as string | undefined;
        const sales = await SaleService.getAllSales(branchId);
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

// Elimina una venta (solo ADMIN/MANAGEMENT — requireRole en la ruta). Restaura
// el stock y revierte el pedido asociado a PENDING. Una venta con factura
// (cualquier estado) queda protegida → 409.
const deleteSale = async (req: Request, res: Response) => {
    try {
        const result = await SaleService.deleteSale(req.params.id);
        res.status(200).json(result);
    } catch (error: any) {
        if (error?.code === "SALE_NOT_FOUND") {
            return res.status(404).json({ message: error.message });
        }
        if (error?.code === "SALE_ALREADY_INVOICED") {
            return res.status(409).json({ error: error.code });
        }
        res.status(400).json({ message: error.message });
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

        // Validar el customer SOLO si viene (spec 6.1): sin customerId la
        // Factura B de mostrador va sin identificar (DocTipo 99 / DocNro 0,
        // sin Customer asociado). La extensión scopa Customer, así que un
        // customerId de otra org → null → 404 (multi-tenant correcto).
        let resolvedCustomerId: string | null = customerId ?? null;
        if (resolvedCustomerId) {
          const customer = await prisma.customer.findFirst({
            where: { id: resolvedCustomerId },
          });
          if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
          }
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
                customerId: resolvedCustomerId,
                saleId,
                // Propaga la sucursal de la venta a la factura (sdd/sucursales-
                // pv-facturacion R4): hoy se descartaba. null en ventas org-wide.
                branchId: sale.branchId ?? null,
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
    deleteSale,
};
