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

// Listado de códigos de balanza (celdas con scaleCode) para el listado imprimible.
router.get(
  "/codes",
  authenticateJWT,
  checkBusinessHours,
  priceKgPlanController.getBalanzaCodes,
);

// Descarga del CSV de códigos de balanza para actualizar precios en la Cuora.
// La planilla la edita ADMIN (PUT /), así que la exportación es SOLO ADMIN.
router.get(
  "/codes/csv",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  priceKgPlanController.getScaleCsv,
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
