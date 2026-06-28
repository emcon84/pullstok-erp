import { Router } from "express";
import SaleController from "../controllers/salesController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { checkSaleInvoicingEnabled } from "../middlewares/checkSaleInvoicingEnabled";
import { validate } from "../middlewares/validate";
import { createSaleSchema, createSaleInvoiceSchema } from "../validation/schemas";

const router = Router();

router.post(
  "/",
  authenticateJWT,
  validate(createSaleSchema),
  SaleController.createSale,
);
router.get("/", authenticateJWT, SaleController.getAllSales);
router.get("/:id", authenticateJWT, SaleController.getSaleById);

// Bridge Sale→Invoice: crea una Invoice DRAFT a partir de una venta existente.
// Requiere PRO o PREMIUM (gate distinto al de /invoices, que era PREMIUM-only).
// Se monta en salesRoutes para NO heredar el router.use de checkInvoicingEnabled
// de invoiceRoutes (que ahora permite PRO+PREMIUM, pero queda desacoplado).
router.post(
  "/:saleId/invoice",
  authenticateJWT,
  checkSaleInvoicingEnabled,
  validate(createSaleInvoiceSchema),
  SaleController.createInvoiceFromSale,
);

export default router;
