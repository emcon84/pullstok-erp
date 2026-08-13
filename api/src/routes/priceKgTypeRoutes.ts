import { Router } from "express";
import priceKgTypeController from "../controllers/priceKgTypeController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import {
  createPriceKgTypeSchema,
  updatePriceKgTypeSchema,
} from "../validation/schemas";

const router = Router();

// Listado: cualquier rol autenticado. Escritura: solo ADMIN.
router.get(
  "/",
  authenticateJWT,
  checkBusinessHours,
  priceKgTypeController.listPriceKgTypes,
);

router.post(
  "/",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(createPriceKgTypeSchema),
  priceKgTypeController.createPriceKgType,
);

router.put(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(updatePriceKgTypeSchema),
  priceKgTypeController.updatePriceKgType,
);

router.delete(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  priceKgTypeController.deletePriceKgType,
);

export default router;
