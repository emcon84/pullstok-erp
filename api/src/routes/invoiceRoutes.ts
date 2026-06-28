import { Router } from "express";
import invoiceController from "../controllers/invoiceController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { checkInvoicingEnabled } from "../middlewares/checkInvoicingEnabled";
import { validate } from "../middlewares/validate";
import { createInvoiceSchema, updateInvoiceSchema } from "../validation/schemas";

const router = Router();

// authenticateJWT primero (resuelve el contexto de tenant vía
// AsyncLocalStorage), checkInvoicingEnabled después (necesita
// requireOrganizationId() ya disponible para resolver el plan).
router.use(authenticateJWT, checkInvoicingEnabled);

router.post(
  "/",
  validate(createInvoiceSchema),
  invoiceController.createInvoice,
);
router.get("/", invoiceController.getInvoices);
router.get("/:id", invoiceController.getInvoiceById);
router.put(
  "/:id",
  validate(updateInvoiceSchema),
  invoiceController.updateInvoice,
);
router.delete("/:id", invoiceController.deleteInvoice);
router.put("/:id/issue", invoiceController.issueInvoice);
router.put("/:id/pay", invoiceController.markAsPaid);
router.put("/:id/cancel", invoiceController.cancelInvoice);

export default router;
