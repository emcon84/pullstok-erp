import { Router } from "express";
import productController, {
  uploadProductsCsv,
} from "../controllers/productController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { upload } from "../middlewares/uploadMiddleware";
import { validate } from "../middlewares/validate";
import { checkProductLimit } from "../middlewares/planLimitMiddleware";
import {
  createProductSchema,
  updateProductSchema,
  bulkProductsSchema,
  publishProductSchema,
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
router.get("/", authenticateJWT, productController.getProducts);
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
  productController.publishProduct,
);
router.delete("/:id", authenticateJWT, productController.deleteProduct);

export default router;
