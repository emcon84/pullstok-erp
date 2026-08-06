import { Router } from "express";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { updateBusinessHoursSchema } from "../validation/schemas";
import {
  getBusinessHours,
  updateBusinessHours,
} from "../controllers/businessHoursController";

// Rutas ADMIN-only de la config de horario comercial (sdd/business-hours-access).
// Sigue la convención de storeSettingsRoutes.ts / organizationRoutes.ts.
const router = Router();

router.get("/", authenticateJWT, requireRole("ADMIN"), getBusinessHours);
router.put(
  "/",
  authenticateJWT,
  requireRole("ADMIN"),
  validate(updateBusinessHoursSchema),
  updateBusinessHours,
);

export default router;