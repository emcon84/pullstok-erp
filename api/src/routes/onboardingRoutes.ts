import { Router } from "express";
import { authenticate } from "../middlewares/authMiddleware";
import { getSuggestedCategories } from "../controllers/organizationController";

const router = Router();

router.get("/suggested-categories", authenticate, getSuggestedCategories);

export default router;
