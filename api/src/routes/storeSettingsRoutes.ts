import { Router } from "express";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { updateStoreSettingsSchema } from "../validation/schemas";
import {
  getStoreSettings,
  updateStoreSettings,
} from "../controllers/storeSettingsController";

// Rutas ADMIN-only de la config de la tienda online (WS4) — NO el router
// público /store (sin JWT). Sigue la convención de organizationRoutes.ts.
const router = Router();

router.get("/", authenticateJWT, requireRole("ADMIN"), getStoreSettings);
router.put(
  "/",
  authenticateJWT,
  requireRole("ADMIN"),
  validate(updateStoreSettingsSchema),
  updateStoreSettings,
);

export default router;
