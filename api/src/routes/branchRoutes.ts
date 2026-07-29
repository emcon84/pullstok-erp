import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { createBranchSchema, updateBranchSchema } from "../validation/schemas";
import {
  createBranch,
  listBranches,
  updateBranch,
  toggleBranchActive,
  deleteBranch,
} from "../controllers/branchController";

const router = Router();

// ADMIN y MANAGEMENT pueden ver y gestionar sucursales.
router.use(authenticate, requireRole("ADMIN", "MANAGEMENT"));

router.post("/", validate(createBranchSchema), createBranch);
router.get("/", listBranches);
router.put("/:id", validate(updateBranchSchema), updateBranch);
router.patch("/:id/active", toggleBranchActive);
router.delete("/:id", deleteBranch);

export default router;
