import { Router } from "express";
import accountController from "../controllers/accountController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import { createAccountSchema, importAccountsSchema, updateAccountSchema } from "../validation/schemas";

const router = Router();

// Plan de cuentas (módulo "contabilidad"). Lectura: cualquier rol autenticado.
// Escritura: ADMIN y MANAGEMENT; la carga del plan base, solo ADMIN.
const canManageAccounts = requireRole("ADMIN", "MANAGEMENT");
router.get("/", authenticateJWT, checkBusinessHours, accountController.listAccounts);
// Antes de "/:id" para que "seed-default" no se interprete como un id.
router.post(
  "/seed-default",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  accountController.seedDefaultAccounts,
);
// Reemplaza el plan completo (importación GFLOW), solo ADMIN; también antes de "/:id".
router.post(
  "/import",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(importAccountsSchema),
  accountController.importAccounts,
);
router.post(
  "/",
  authenticateJWT,
  checkBusinessHours,
  canManageAccounts,
  validate(createAccountSchema),
  accountController.createAccount,
);
router.patch(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  canManageAccounts,
  validate(updateAccountSchema),
  accountController.updateAccount,
);
router.delete(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  canManageAccounts,
  accountController.deleteAccount,
);

export default router;
