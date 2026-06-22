import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import {
  createOrganizationSchema,
  updateOrganizationPlanSchema,
  registerBillingPaymentSchema,
} from "../validation/schemas";
import {
  createOrganization,
  listOrganizations,
  setOrganizationActive,
  updateOrganizationPlan,
  registerOrganizationBilling,
} from "../controllers/superadminController";

const router = Router();

// Todas las rutas de plataforma requieren rol SUPERADMIN.
router.use(authenticate, requireRole("SUPERADMIN"));

router.post(
  "/organizations",
  validate(createOrganizationSchema),
  createOrganization,
);
router.get("/organizations", listOrganizations);
router.patch("/organizations/:id/active", setOrganizationActive);
router.patch(
  "/organizations/:id/plan",
  validate(updateOrganizationPlanSchema),
  updateOrganizationPlan,
);
router.patch(
  "/organizations/:id/billing",
  validate(registerBillingPaymentSchema),
  registerOrganizationBilling,
);

export default router;
