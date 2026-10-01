import { Router } from "express";
import providerController from "../controllers/providerController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import { createProviderSchema, updateProviderSchema } from "../validation/schemas";

const router = Router();

// Lectura: cualquier rol autenticado (el GET "/" alimenta los selectores de
// productos y planillas, no cambia de contrato). Escritura: solo ADMIN y
// MANAGEMENT, el mismo set que ve la pantalla /Proveedores.
const canManageProviders = requireRole("ADMIN", "MANAGEMENT");
router.get("/", authenticateJWT, checkBusinessHours, providerController.listProviders);
router.post(
  "/",
  authenticateJWT,
  checkBusinessHours,
  canManageProviders,
  validate(createProviderSchema),
  providerController.createProvider,
);
router.get("/:id", authenticateJWT, checkBusinessHours, providerController.getProviderById);
router.put(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  canManageProviders,
  validate(updateProviderSchema),
  providerController.updateProvider,
);
router.delete(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  canManageProviders,
  providerController.deleteProvider,
);

export default router;
