import { Router } from "express";
import receiptController from "../controllers/receiptController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import { createReceiptSchema } from "../validation/schemas";

const router = Router();

router.get("/", authenticateJWT, checkBusinessHours, receiptController.getReceipts);
router.post(
  "/",
  authenticateJWT,
  checkBusinessHours,
  validate(createReceiptSchema),
  receiptController.createReceipt,
);

export default router;
