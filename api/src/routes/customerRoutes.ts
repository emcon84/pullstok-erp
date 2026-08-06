import { Router } from "express";
import customerController from "../controllers/customerController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import {
  createCustomerSchema,
  updateCustomerSchema,
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
