import { Router } from "express";
import productController, {
  uploadProductsCsv,
  downloadTemplateCsv,
  getProductByCode,
} from "../controllers/productController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { upload } from "../middlewares/uploadMiddleware";
import { validate } from "../middlewares/validate";
import {
  checkProductLimit,
  checkStoreProductLimit,
} from "../middlewares/planLimitMiddleware";
import {
  createProductSchema,
  updateProductSchema,
  bulkProductsSchema,
  publishProductSchema,
  bulkPriceUpdateSchema,
  updateBranchStockSchema,
} from "../validation/schemas";

const router = Router();

router.post(
  "/",
  authenticateJWT,
  validate(createProductSchema),
  checkProductLimit,
  productController.createProduct,
);
router.post(
  "/bulk",
  authenticateJWT,
  validate(bulkProductsSchema),
  productController.bulkUploadProducts,
);
router.post(
  "/upload-csv",
  authenticateJWT,
  upload.single("file"),
  uploadProductsCsv,
);
router.get("/template-csv", downloadTemplateCsv);
router.get("/by-code/:code", authenticateJWT, getProductByCode);
router.get("/", authenticateJWT, productController.getProducts);

// Resumen de stock de toda la org (dashboard). Debe registrarse ANTES de
// "/:id" (un id literal "stock-summary" la matchearía) y antes de la sección
// de rutas paramétricas de stock de abajo.
router.get(
  "/stock-summary",
  authenticateJWT,
  productController.getStockSummary,
);

router.get("/:id", authenticateJWT, productController.getProductById);
router.put(
  "/:id",
  authenticateJWT,
  validate(updateProductSchema),
  productController.updateProduct,
);
router.patch(
  "/:id/publish",
  authenticateJWT,
  validate(publishProductSchema),
  checkStoreProductLimit,
  productController.publishProduct,
);
router.delete("/:id", authenticateJWT, productController.deleteProduct);

// Stock por sucursal (branch-stock, PR 2b): consulta autocontenida para
// cualquier rol autenticado y edición con autorización server-side (A1/A2).
router.get("/:id/stock", authenticateJWT, productController.getProductStock);
router.put(
  "/:id/stock/:branchId",
  authenticateJWT,
  validate(updateBranchStockSchema),
  productController.updateBranchStock,
);

// Bulk price update — ADMIN only
router.post(
  "/bulk-price-update",
  authenticateJWT,
  requireRole("ADMIN"),
  validate(bulkPriceUpdateSchema),
  productController.bulkPriceUpdate,
);

export default router;
