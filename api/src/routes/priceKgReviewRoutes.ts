import { Router } from "express";
import priceKgReviewController from "../controllers/priceKgReviewController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validateQuery } from "../middlewares/validate";
import {
  reviewQueueQuerySchema,
  priceKgProductsQuerySchema,
} from "../validation/schemas";

/**
 * Cola de revisión de precios por kilo: todas las rutas exigen ADMIN porque
 * implican aplicar (o descartar) precios a productos. El auto-apply y el
 * approve/reject escriben; el listado solo lee.
 */
const reviewRouter = Router();

reviewRouter.post(
  "/auto-apply",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  priceKgReviewController.autoApply,
);

reviewRouter.get(
  "/queue",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  validateQuery(reviewQueueQuerySchema),
  priceKgReviewController.listQueue,
);

reviewRouter.post(
  "/queue/:id/approve",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  priceKgReviewController.approveEntry,
);

reviewRouter.post(
  "/queue/:id/reject",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  priceKgReviewController.rejectEntry,
);

/**
 * Productos de una celda de la planilla (panel de venta suelta). Vive en este
 * archivo pero se monta en la RAÍZ (/price-kg-products), NO bajo
 * /price-kg-review: lo consume cualquier rol autenticado que abra el panel
 * desde la vista de planilla.
 */
export const priceKgProductsRouter = Router();

priceKgProductsRouter.get(
  "/",
  authenticateJWT,
  checkBusinessHours,
  validateQuery(priceKgProductsQuerySchema),
  priceKgReviewController.listProductsForCell,
);

export default reviewRouter;