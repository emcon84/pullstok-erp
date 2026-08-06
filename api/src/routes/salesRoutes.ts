import { Router } from "express";
import SaleController from "../controllers/salesController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { checkSaleInvoicingEnabled } from "../middlewares/checkSaleInvoicingEnabled";
import { validate } from "../middlewares/validate";
import { createSaleSchema, createSaleInvoiceSchema } from "../validation/schemas";

const router = Router();

router.post(
  "/",
  authenticateJWT,
  checkBusinessHours,
  validate(createSaleSchema),
  SaleController.createSale,
);
router.get("/", authenticateJWT, checkBusinessHours, SaleController.getAllSales);
router.get("/:id", authenticateJWT, checkBusinessHours, SaleController.getSaleById);

// Elimina una venta: solo ADMIN/MANAGEMENT. Restaura el stock y revierte el
// pedido asociado a PENDING. Una venta con factura (cualquier estado) queda
// protegida → 409 SALE_ALREADY_INVOICED.
router.delete(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN", "MANAGEMENT"),
  SaleController.deleteSale,
);

// Bridge Sale→Invoice: crea una Invoice DRAFT a partir de una venta existente.
// Requiere PRO o PREMIUM (gate distinto al de /invoices, que era PREMIUM-only).
// Se monta en salesRoutes para NO heredar el router.use de checkInvoicingEnabled
// de invoiceRoutes (que ahora permite PRO+PREMIUM, pero queda desacoplado).
router.post(
  "/:saleId/invoice",
  authenticateJWT,
  checkBusinessHours,
  checkSaleInvoicingEnabled,
  validate(createSaleInvoiceSchema),
  SaleController.createInvoiceFromSale,
);

export default router;
