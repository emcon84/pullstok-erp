import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { createCategoriesSchema, updateCategorySchema } from "../validation/schemas";
import {
  createCategories,
  getCategories,
  updateCategory,
  deleteCategory,
} from "../controllers/categoryController";

const router = Router();

router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  validate(createCategoriesSchema),
  createCategories,
);
router.get("/", authenticate, getCategories);
router.put(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  validate(updateCategorySchema),
  updateCategory,
);
router.delete("/:id", authenticate, requireRole("ADMIN"), deleteCategory);

export default router;
