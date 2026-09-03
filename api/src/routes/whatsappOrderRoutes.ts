import { Router } from "express";
import whatsappOrderController from "../controllers/whatsappOrderController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import { approveDraftSchema } from "../validation/schemas";

// Rutas de borradores de pedido de WhatsApp (FASE 3). Autenticadas (las usa el
// ERP) + gate de horario comercial, igual que /orders.
const router = Router();

router.get("/", authenticateJWT, checkBusinessHours, whatsappOrderController.list);
router.post(
  "/:id/approve",
  authenticateJWT,
  checkBusinessHours,
  validate(approveDraftSchema),
  whatsappOrderController.approve,
);
router.post(
  "/:id/reject",
  authenticateJWT,
  checkBusinessHours,
  whatsappOrderController.reject,
);

export default router;
