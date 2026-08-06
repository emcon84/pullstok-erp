import { Router } from "express";
import productController, {
  uploadProductsCsv,
  downloadTemplateCsv,
  getProductByCode,
} from "../controllers/productController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
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
  checkBusinessHours,
  validate(createProductSchema),
  checkProductLimit,
  productController.createProduct,
);
router.post(
  "/bulk",
  authenticateJWT,
  checkBusinessHours,
  validate(bulkProductsSchema),
  productController.bulkUploadProducts,
);
router.post(
  "/upload-csv",
  authenticateJWT,
  checkBusinessHours,
  upload.single("file"),
  uploadProductsCsv,
);
router.get("/template-csv", downloadTemplateCsv);
router.get("/by-code/:code", authenticateJWT, checkBusinessHours, getProductByCode);
router.get("/", authenticateJWT, checkBusinessHours, productController.getProducts);

// Resumen de stock de toda la org (dashboard). Debe registrarse ANTES de
// "/:id" (un id literal "stock-summary" la matchearía) y antes de la sección
// de rutas paramétricas de stock de abajo.
router.get(
  "/stock-summary",
  authenticateJWT,
  checkBusinessHours,
  productController.getStockSummary,
);

// Complete filter facets (categories + variants per category) for the vendor
// dashboard chips. Must be registered BEFORE "/:id" so a literal id like
// "filter-facets" doesn't match the parametric route.
router.get(
  "/filter-facets",
  authenticateJWT,
  checkBusinessHours,
  productController.getProductFilterFacets,
);

router.get("/:id", authenticateJWT, checkBusinessHours, productController.getProductById);
router.put(
  "/:id",
  authenticateJWT,
  checkBusinessHours,
  validate(updateProductSchema),
  productController.updateProduct,
);
router.patch(
  "/:id/publish",
  authenticateJWT,
  checkBusinessHours,
  validate(publishProductSchema),
  checkStoreProductLimit,
  productController.publishProduct,
);
router.delete("/:id", authenticateJWT, checkBusinessHours, requireRole("ADMIN", "MANAGEMENT"), productController.deleteProduct);

// Stock por sucursal (branch-stock, PR 2b): consulta autocontenida para
// cualquier rol autenticado y edición con autorización server-side (A1/A2).
router.get("/:id/stock", authenticateJWT, checkBusinessHours, productController.getProductStock);
router.put(
  "/:id/stock/:branchId",
  authenticateJWT,
  checkBusinessHours,
  validate(updateBranchStockSchema),
  productController.updateBranchStock,
);

// Bulk price update — ADMIN only
router.post(
  "/bulk-price-update",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(bulkPriceUpdateSchema),
  productController.bulkPriceUpdate,
);

export default router;
