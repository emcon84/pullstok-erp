import { Router } from "express";
import quotationController from "../controllers/quotationController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import {
  createQuotationSchema,
  updateQuotationSchema,
} from "../validation/schemas";

const router = Router();

router.post(
  "/",
  authenticateJWT,
  checkBusinessHours,
  validate(createQuotationSchema),
  quotationController.createQuotation,
);
router.get("/", authenticateJWT, checkBusinessHours, quotationController.getQuotations);
router.get("/:id", authenticateJWT, checkBusinessHours, quotationController.getQuotationById);
router.put(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  validate(updateQuotationSchema),
  quotationController.updateQuotation,
);
router.delete(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  quotationController.deleteQuotation,
);

export default router;
