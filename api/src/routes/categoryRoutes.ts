import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import {
  createCategoriesSchema,
  createCategorySchema,
  updateCategorySchema,
  createVariantSchema,
  updateVariantSchema,
  createVariantOptionSchema,
  updateVariantOptionSchema,
} from "../validation/schemas";
import {
  createCategories,
  createCategory,
  getCategories,
  getTree,
  getCategoryChildren,
  updateCategory,
  deleteCategory,
  getCategoryVariants,
  createVariant,
  updateVariant,
  deleteVariant,
  createVariantOption,
  updateVariantOption,
  deleteVariantOption,
} from "../controllers/categoryController";

const router = Router();

// =========================================================================
// Category CRUD
// =========================================================================

router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  validate(createCategoriesSchema),
  createCategories,
);
router.post(
  "/single",
  authenticate,
  requireRole("ADMIN"),
  validate(createCategorySchema),
  createCategory,
);
router.get("/", authenticate, getCategories);
// /tree MUST come before /:id/children to avoid matching "tree" as an :id param
router.get("/tree", authenticate, getTree);
router.get("/:id/children", authenticate, getCategoryChildren);
router.put(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  validate(updateCategorySchema),
  updateCategory,
);
router.delete("/:id", authenticate, requireRole("ADMIN"), deleteCategory);

// =========================================================================
// Variant Definitions (nested under categories)
// =========================================================================

router.get("/:id/variants", authenticate, getCategoryVariants);
router.post(
  "/:id/variants",
  authenticate,
  requireRole("ADMIN"),
  validate(createVariantSchema),
  createVariant,
);

// =========================================================================
// Variant Definitions (standalone — for PUT/DELETE where we have only the variant ID)
// =========================================================================

router.put(
  "/variants/:id",
  authenticate,
  requireRole("ADMIN"),
  validate(updateVariantSchema),
  updateVariant,
);
router.delete("/variants/:id", authenticate, requireRole("ADMIN"), deleteVariant);

// =========================================================================
// Variant Options (standalone — nested under variant ID)
// =========================================================================

router.post(
  "/variants/:id/options",
  authenticate,
  requireRole("ADMIN"),
  validate(createVariantOptionSchema),
  createVariantOption,
);
router.put(
  "/options/:id",
  authenticate,
  requireRole("ADMIN"),
  validate(updateVariantOptionSchema),
  updateVariantOption,
);
router.delete("/options/:id", authenticate, requireRole("ADMIN"), deleteVariantOption);

export default router;
