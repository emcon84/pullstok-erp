import { Router } from "express";
import customerController from "../controllers/customerController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import {
  createCustomerSchema,
  updateCustomerSchema,
} from "../validation/schemas";

const router = Router();

router.post(
  "/",
  authenticateJWT,
  validate(createCustomerSchema),
  customerController.createCustomer,
);
router.get("/", authenticateJWT, customerController.getCustomers);
router.get("/:id", authenticateJWT, customerController.getCustomerById);
router.put(
  "/:id",
  authenticateJWT,
  validate(updateCustomerSchema),
  customerController.updateCustomer,
);
router.delete("/:id", authenticateJWT, customerController.deleteCustomer);

export default router;
