import { Router } from "express";
import LooseStockController from "../controllers/looseStockController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate, validateQuery } from "../middlewares/validate";
import {
  openBagSchema,
  setLooseStockSchema,
  listLooseStocksQuerySchema,
} from "../validation/schemas";

/**
 * Stock de alimento suelto (sdd/loose-lines-stock). open-bag y GET los usa
 * cualquier rol autenticado (el vendedor abre bolsas y consulta líneas); el
 * ajuste manual (PUT /:lineId) es solo ADMIN/MANAGEMENT.
 */
const router = Router();

router.post(
  "/open-bag",
  authenticateJWT,
  checkBusinessHours,
  validate(openBagSchema),
  LooseStockController.openBag,
);

router.get(
  "/",
  authenticateJWT,
  checkBusinessHours,
  validateQuery(listLooseStocksQuerySchema),
  LooseStockController.list,
);

/**
 * GET /:lineId y PUT /:lineId. El GET se declara DESPUÉS del POST /open-bag
 * en este archivo, así que "open-bag" nunca colisiona con ":lineId".
 */
router.get(
  "/:lineId",
  authenticateJWT,
  checkBusinessHours,
  validateQuery(listLooseStocksQuerySchema),
  LooseStockController.get,
);

router.put(
  "/:lineId",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN", "MANAGEMENT"),
  validate(setLooseStockSchema),
  LooseStockController.set,
);

export default router;