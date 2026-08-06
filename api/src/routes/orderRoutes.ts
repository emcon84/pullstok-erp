import { Router } from "express";
import orderController from "../controllers/orderController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import {
  createOrderSchema,
  updateOrderStatusSchema,
  updateOrderSchema,
} from "../validation/schemas";

const router = Router();

router.post(
  "/",
  authenticateJWT,
  checkBusinessHours,
  validate(createOrderSchema),
  orderController.createOrder,
);
router.get("/", authenticateJWT, checkBusinessHours, orderController.getOrders);
// IMPORTANTE: /pending-count debe ir ANTES de /:id, si no Express lo matchea
// como un id ("pending-count") y nunca llega a este handler.
router.get(
  "/pending-count",
  authenticateJWT,
  checkBusinessHours,
  orderController.getPendingOrdersCount,
);
router.get("/:id", authenticateJWT, checkBusinessHours, orderController.getOrderById);
router.put(
  "/:id/status",
  authenticateJWT,
  checkBusinessHours,
  validate(updateOrderStatusSchema),
  orderController.updateOrderStatus,
);
router.put(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  validate(updateOrderSchema),
  orderController.updateOrder,
);
router.delete("/:id", authenticateJWT, checkBusinessHours, orderController.deleteOrder);

export default router;
