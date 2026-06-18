import { Router } from "express";
import receiptController from "../controllers/receiptController";
import { authenticateJWT } from "../middlewares/authMiddleware";

const router = Router();

router.get("/", authenticateJWT, receiptController.getReceipts);
router.post("/", authenticateJWT, receiptController.createReceipt);

export default router;
