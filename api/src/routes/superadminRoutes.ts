import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import {
  createOrganizationSchema,
  updateOrganizationPlanSchema,
  registerBillingPaymentSchema,
  superadminCreateUserSchema,
} from "../validation/schemas";
import {
  createOrganization,
  listOrganizations,
  setOrganizationActive,
  updateOrganizationPlan,
  registerOrganizationBilling,
  clearOrganizationConversations,
  listOrgUsers,
  createOrgUser,
  toggleOrgUserActive,
  deleteOrgUser,
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
router.delete(
  "/organizations/:id/conversations",
  clearOrganizationConversations,
);

// ── SUPERADMIN: User CRUD per organization ──────────────────
router.get("/organizations/:orgId/users", listOrgUsers);
router.post(
  "/organizations/:orgId/users",
  validate(superadminCreateUserSchema),
  createOrgUser,
);
router.patch(
  "/organizations/:orgId/users/:userId/active",
  toggleOrgUserActive,
);
router.delete(
  "/organizations/:orgId/users/:userId",
  deleteOrgUser,
);

export default router;
