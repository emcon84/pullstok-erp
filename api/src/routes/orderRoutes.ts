import { Router } from "express";
import orderController from "../controllers/orderController";
import { authenticateJWT } from "../middlewares/authMiddleware";
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
  validate(createOrderSchema),
  orderController.createOrder,
);
router.get("/", authenticateJWT, orderController.getOrders);
router.get("/:id", authenticateJWT, orderController.getOrderById);
router.put(
  "/:id/status",
  authenticateJWT,
  validate(updateOrderStatusSchema),
  orderController.updateOrderStatus,
);
router.put(
  "/:id",
  authenticateJWT,
  validate(updateOrderSchema),
  orderController.updateOrder,
);

export default router;
