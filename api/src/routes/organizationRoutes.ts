import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { updateOrganizationSchema } from "../validation/schemas";
import {
  updateOrganization,
  completeOnboarding,
} from "../controllers/organizationController";

const router = Router();

router.patch(
  "/me",
  authenticate,
  requireRole("ADMIN"),
  validate(updateOrganizationSchema),
  updateOrganization,
);
router.post(
  "/me/complete-onboarding",
  authenticate,
  requireRole("ADMIN"),
  completeOnboarding,
);

export default router;
