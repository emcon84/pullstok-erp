import { Router } from "express";
import SaleController from "../controllers/salesController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { createSaleSchema } from "../validation/schemas";

const router = Router();

router.post(
  "/",
  authenticateJWT,
  validate(createSaleSchema),
  SaleController.createSale,
);
router.get("/", authenticateJWT, SaleController.getAllSales);
router.get("/:id", authenticateJWT, SaleController.getSaleById);

export default router;
