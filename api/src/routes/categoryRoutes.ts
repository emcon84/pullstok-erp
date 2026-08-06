import { Router, Request, Response } from "express";
import { authenticate, requireRole } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import { prisma } from "../config/db";
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

// GET /variant-options?def=Marca — return unique option values for a variant definition
const getVariantOptionsByDef = async (req: Request, res: Response) => {
  try {
    const defName = req.query.def as string;
    if (!defName) return res.status(400).json({ message: "Falta el parámetro 'def'" });
    const options = await prisma.categoryVariantOption.findMany({
      where: { variant: { name: defName } },
      select: { id: true, value: true },
      orderBy: { value: "asc" },
    });
    res.json(options);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

const router = Router();

// =========================================================================
// Category CRUD
// =========================================================================

router.post(
  "/",
  authenticate,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(createCategoriesSchema),
  createCategories,
);
router.post(
  "/single",
  authenticate,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(createCategorySchema),
  createCategory,
);
router.get("/", authenticate, checkBusinessHours, getCategories);
// /tree MUST come before /:id/children to avoid matching "tree" as an :id param
router.get("/tree", authenticate, checkBusinessHours, getTree);
router.get("/variant-options", authenticate, checkBusinessHours, getVariantOptionsByDef);
router.get("/:id/children", authenticate, checkBusinessHours, getCategoryChildren);
router.put(
  "/:id",
  authenticate,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(updateCategorySchema),
  updateCategory,
);
router.delete("/:id", authenticate, checkBusinessHours, requireRole("ADMIN"), deleteCategory);

// =========================================================================
// Variant Definitions (nested under categories)
// =========================================================================

router.get("/:id/variants", authenticate, checkBusinessHours, getCategoryVariants);
router.post(
  "/:id/variants",
  authenticate,
  checkBusinessHours,
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
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(updateVariantSchema),
  updateVariant,
);
router.delete("/variants/:id", authenticate, checkBusinessHours, requireRole("ADMIN"), deleteVariant);

// =========================================================================
// Variant Options (standalone — nested under variant ID)
// =========================================================================

router.post(
  "/variants/:id/options",
  authenticate,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(createVariantOptionSchema),
  createVariantOption,
);
router.put(
  "/options/:id",
  authenticate,
  checkBusinessHours,
  requireRole("ADMIN"),
  validate(updateVariantOptionSchema),
  updateVariantOption,
);
router.delete("/options/:id", authenticate, checkBusinessHours, requireRole("ADMIN"), deleteVariantOption);

export default router;
