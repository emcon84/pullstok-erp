import { Router } from "express";
import receiptController from "../controllers/receiptController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { createReceiptSchema } from "../validation/schemas";

const router = Router();

router.get("/", authenticateJWT, receiptController.getReceipts);
router.post(
  "/",
  authenticateJWT,
  validate(createReceiptSchema),
  receiptController.createReceipt,
);

export default router;
