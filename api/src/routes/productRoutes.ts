import { Router } from "express";
import productController, {
  uploadProductsCsv,
  downloadTemplateCsv,
  getProductByCode,
  getPriceKgList,
} from "../controllers/productController";
import providerPriceListController from "../controllers/providerPriceListController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { upload, uploadPdf, handleUploadError } from "../middlewares/uploadMiddleware";
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
  bulkKgPriceUpdateSchema,
  updateBranchStockSchema,
  applyPriceListSchema,
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

// Listado imprimible de precios por kilo (catálogo completo de la org, sin
// paginación). Registrado ANTES de "/:id" (una literal "price-kg-list" la
// matchearía).
router.get(
  "/price-kg-list",
  authenticateJWT,
  checkBusinessHours,
  getPriceKgList,
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

// Bulk kg price update (precios por kilo) — ADMIN only. Registrado junto al
// bulk-price-update existente, DESPUÉS de las rutas paramétricas /:id para no
// chocar con ellas (una literal "bulk-kg-price-update" la matchearía /:id).
// ?dryRun=true → preview; sin flag → apply.
router.post(
  "/bulk-kg-price-update",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(bulkKgPriceUpdateSchema),
  productController.bulkKgPriceUpdate,
);

// Import de planillas de precios Alican (sdd/alican-wholesale-price-list) — ADMIN only.
// ?dryRun=true (default) → preview; ?dryRun=false → apply con decisiones default (D10).
router.post(
  "/import-price-list",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  uploadPdf.single("file"),
  handleUploadError,
  providerPriceListController.importPriceList,
);
// Apply del preview en 2 pasos (decisión humana): payload con el echo de las
// filas del preview + decisiones por fila. Transaccional e idempotente.
router.post(
  "/import-price-list/apply",
  authenticateJWT,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(applyPriceListSchema),
  providerPriceListController.applyPriceList,
);

export default router;
