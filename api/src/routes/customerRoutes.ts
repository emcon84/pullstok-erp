import { Router } from "express";
import customerController from "../controllers/customerController";
import customerAccountController from "../controllers/customerAccountController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { requireBalancesToken } from "../middlewares/requireBalancesToken";
import { validate, validateQuery } from "../middlewares/validate";
import {
  createCustomerSchema,
  unlockBalancesSchema,
  updateCustomerSchema,
  createAccountPaymentSchema,
  createAccountChargeSchema,
  updateAccountMovementSchema,
  accountCollectionsQuerySchema,
} from "../validation/schemas";

const router = Router();

router.post(
  "/",
  authenticateJWT,
  checkBusinessHours,
  validate(createCustomerSchema),
  customerController.createCustomer,
);
router.get("/", authenticateJWT, checkBusinessHours, customerController.getCustomers);
// Cuenta corriente (cuenta-corriente): "/balances" es un literal → va ANTES de
// "/:id" para que no lo capture como id.
router.get("/balances", authenticateJWT, checkBusinessHours, customerAccountController.getBalances);
// Balances summary lock: literals under "/balances", BEFORE "/:id". Only owners
// (ADMIN/MANAGEMENT); the summary additionally needs the X-Balances-Token.
router.post(
  "/balances/unlock",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN", "MANAGEMENT"),
  validate(unlockBalancesSchema),
  customerAccountController.unlockBalances,
);
router.get(
  "/balances/summary",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN", "MANAGEMENT"),
  requireBalancesToken,
  customerAccountController.getBalancesSummary,
);
// Cobros de cuenta corriente por medio de pago (dashboard de ventas): literal
// de un segmento → ANTES de "/:id". Solo dueños (ADMIN/MANAGEMENT).
router.get(
  "/account-collections",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN", "MANAGEMENT"),
  validateQuery(accountCollectionsQuerySchema),
  customerAccountController.getAccountCollections,
);
router.get("/:id/account", authenticateJWT, checkBusinessHours, customerAccountController.getAccount);
router.post(
  "/:id/account/payments",
  authenticateJWT,
  checkBusinessHours,
  validate(createAccountPaymentSchema),
  customerAccountController.registerPayment,
);
// Cargo histórico (deuda anterior sin venta): literal bajo "/:id/account", va
// ANTES de "/:id" a secas.
router.post(
  "/:id/account/charges",
  authenticateJWT,
  checkBusinessHours,
  validate(createAccountChargeSchema),
  customerAccountController.registerHistoricalCharge,
);
// Edit / delete of a manual charge or a payment: literals under "/:id/account",
// BEFORE "/:id".
router.patch(
  "/:id/account/movements/:movementId",
  authenticateJWT,
  checkBusinessHours,
  validate(updateAccountMovementSchema),
  customerAccountController.updateMovement,
);
router.delete(
  "/:id/account/movements/:movementId",
  authenticateJWT,
  checkBusinessHours,
  customerAccountController.deleteMovement,
);
// Comprobante de cuenta por WhatsApp (cuenta-corriente T1): literal bajo
// "/:id/account", también va ANTES de "/:id" a secas.
router.post(
  "/:id/account/statement/whatsapp",
  authenticateJWT,
  checkBusinessHours,
  customerAccountController.sendAccountStatementWhatsapp,
);
// wa.me fallback (Kapso sandbox no puede enviar sin sesión activa): arma el
// PDF y devuelve su URL, también ANTES de "/:id" a secas.
router.post(
  "/:id/account/statement-link",
  authenticateJWT,
  checkBusinessHours,
  customerAccountController.getAccountStatementLink,
);
router.get("/:id", authenticateJWT, checkBusinessHours, customerController.getCustomerById);
router.put(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  validate(updateCustomerSchema),
  customerController.updateCustomer,
);
router.delete("/:id", authenticateJWT, checkBusinessHours, customerController.deleteCustomer);

export default router;
