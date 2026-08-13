import { Router } from "express";
import priceKgBrandController from "../controllers/priceKgBrandController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import {
  createPriceKgBrandSchema,
  updatePriceKgBrandSchema,
} from "../validation/schemas";

const router = Router();

// Listado: cualquier rol autenticado. Escritura: solo ADMIN.
router.get(
  "/",
  authenticateJWT,
  checkBusinessHours,
  priceKgBrandController.listPriceKgBrands,
);

router.post(
  "/",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(createPriceKgBrandSchema),
  priceKgBrandController.createPriceKgBrand,
);

router.put(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(updatePriceKgBrandSchema),
  priceKgBrandController.updatePriceKgBrand,
);

router.delete(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  priceKgBrandController.deletePriceKgBrand,
);

export default router;
