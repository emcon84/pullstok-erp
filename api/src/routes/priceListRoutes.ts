import { Router } from "express";
import priceListController from "../controllers/providerPriceListController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { adjustPriceListSchema } from "../validation/schemas";

// Planillas de precios de proveedor (sdd/alican-wholesale-price-list) — ADMIN.
const router = Router();

router.get("/", authenticateJWT, requireRole("ADMIN"), priceListController.listPriceLists);
router.get("/:id", authenticateJWT, requireRole("ADMIN"), priceListController.getPriceList);
router.post(
  "/:id/adjust",
  authenticateJWT,
  requireRole("ADMIN"),
  validate(adjustPriceListSchema),
  priceListController.adjustPriceList,
);

export default router;
