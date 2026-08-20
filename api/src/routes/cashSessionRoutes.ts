import { Router } from "express";
import cashSessionController from "../controllers/cashSessionController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate, validateQuery } from "../middlewares/validate";
import {
  openCashSessionSchema,
  closeCashSessionSchema,
  cashSessionQuerySchema,
} from "../validation/schemas";

/**
 * Caja (sdd/caja-apertura-cierre). Rutas:
 *  - POST / (open): CASHIER/VENDEDOR (sucursal asignada) + ADMIN/MANAGEMENT
 *    (sucursal explícita).
 *  - POST /:id/close: dueño (CASHIER/VENDEDOR) o ADMIN/MANAGEMENT (el service
 *    valida ownership).
 *  - GET /current: todos los autenticados (operativos su propia sesión;
 *    ?branchId solo para gestión).
 *  - GET /:id: dueño o gestión (el service escopa operativos por cashierId).
 *  - GET /: listado: gestión ve todas; operativos solo las propias.
 */
const router = Router();

router.post(
  "/",
  authenticateJWT,
  checkBusinessHours,
  requireRole("CASHIER", "VENDEDOR", "ADMIN", "MANAGEMENT"),
  validate(openCashSessionSchema),
  cashSessionController.openCashSession,
);

router.post(
  "/:id/close",
  authenticateJWT,
  checkBusinessHours,
  requireRole("CASHIER", "VENDEDOR", "ADMIN", "MANAGEMENT"),
  validate(closeCashSessionSchema),
  cashSessionController.closeCashSession,
);

// GET /current se declara ANTES de GET /:id para que "current" no colisione
// con el param :id.
router.get(
  "/current",
  authenticateJWT,
  checkBusinessHours,
  cashSessionController.getCurrentCashSession,
);

router.get(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  cashSessionController.getCashSession,
);

router.get(
  "/",
  authenticateJWT,
  checkBusinessHours,
  validateQuery(cashSessionQuerySchema),
  cashSessionController.listCashSessions,
);

export default router;
