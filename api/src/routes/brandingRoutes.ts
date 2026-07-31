import { Router } from "express";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { updateAppBrandingSchema } from "../validation/schemas";
import {
  getBranding,
  updateBranding,
} from "../controllers/brandingController";

// Branding del ERP: GET público para cualquier usuario autenticado (todos los
// roles), PUT solo para ADMIN. El plan check (BASICO → 403) se hace inline en
// el controller (mismo enfoque que design doc — single-module gate).
const router = Router();

router.get("/", authenticateJWT, getBranding);
router.put(
  "/",
  authenticateJWT,
  requireRole("ADMIN"),
  validate(updateAppBrandingSchema),
  updateBranding,
);

export default router;
