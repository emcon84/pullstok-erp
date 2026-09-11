import { Router } from "express";
import savedPlanillaController from "../controllers/savedPlanillaController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { savePlanillaSchema } from "../validation/schemas";

// Planillas guardadas por el usuario (saved planillas) — ADMIN.
const router = Router();

router.post(
  "/",
  authenticateJWT,
  requireRole("ADMIN"),
  validate(savePlanillaSchema),
  savedPlanillaController.createSavedPlanilla,
);
router.get(
  "/",
  authenticateJWT,
  requireRole("ADMIN"),
  savedPlanillaController.listSavedPlanillas,
);
router.get(
  "/:id",
  authenticateJWT,
  requireRole("ADMIN"),
  savedPlanillaController.getSavedPlanilla,
);
router.delete(
  "/:id",
  authenticateJWT,
  requireRole("ADMIN"),
  savedPlanillaController.deleteSavedPlanilla,
);

export default router;
