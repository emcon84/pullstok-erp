import { Router } from "express";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { updatePricingSettingSchema } from "../validation/schemas";
import {
  getPricingSetting,
  updatePricingSetting,
} from "../controllers/pricingController";

// Configuración de precios (sdd/venta-alimento-suelto A-01): GET para
// cualquier usuario autenticado (todos los roles), PUT solo ADMIN/MANAGEMENT
// (la recomputación es org-scoped y segura — design doc D4). El plan check
// (BASICO → 403) se hace inline en el controller (mismo enfoque que branding).
const router = Router();

router.get("/", authenticateJWT, getPricingSetting);
router.put(
  "/",
  authenticateJWT,
  requireRole("ADMIN", "MANAGEMENT"),
  validate(updatePricingSettingSchema),
  updatePricingSetting,
);

export default router;