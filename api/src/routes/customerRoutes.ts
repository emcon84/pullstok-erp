import { Router } from "express";
import customerController from "../controllers/customerController";
import customerAccountController from "../controllers/customerAccountController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import {
  createCustomerSchema,
  updateCustomerSchema,
  createAccountPaymentSchema,
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
router.get("/:id/account", authenticateJWT, checkBusinessHours, customerAccountController.getAccount);
router.post(
  "/:id/account/payments",
  authenticateJWT,
  checkBusinessHours,
  validate(createAccountPaymentSchema),
  customerAccountController.registerPayment,
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
