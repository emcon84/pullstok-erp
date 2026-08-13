import { Router } from "express";
import priceKgPlanController from "../controllers/priceKgPlanController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import { savePriceKgPlanSchema } from "../validation/schemas";

const router = Router();

// Lectura de la planilla: cualquier rol autenticado. Escritura: solo ADMIN.
router.get(
  "/",
  authenticateJWT,
  checkBusinessHours,
  priceKgPlanController.getPriceKgPlan,
);

router.put(
  "/",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(savePriceKgPlanSchema),
  priceKgPlanController.savePriceKgPlan,
);

export default router;
