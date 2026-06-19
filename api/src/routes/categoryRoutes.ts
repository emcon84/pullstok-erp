import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { createCategoriesSchema } from "../validation/schemas";
import { createCategories, getCategories } from "../controllers/categoryController";

const router = Router();

router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  validate(createCategoriesSchema),
  createCategories,
);
router.get("/", authenticate, getCategories);

export default router;
