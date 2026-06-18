import { Router } from "express";
import quotationController from "../controllers/quotationController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import {
  createQuotationSchema,
  updateQuotationSchema,
} from "../validation/schemas";

const router = Router();

router.post(
  "/",
  authenticateJWT,
  validate(createQuotationSchema),
  quotationController.createQuotation,
);
router.get("/", authenticateJWT, quotationController.getQuotations);
router.get("/:id", authenticateJWT, quotationController.getQuotationById);
router.put(
  "/:id",
  authenticateJWT,
  validate(updateQuotationSchema),
  quotationController.updateQuotation,
);

export default router;
