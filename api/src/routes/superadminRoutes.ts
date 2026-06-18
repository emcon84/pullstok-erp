import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/authMiddleware";
import {
  createOrganization,
  listOrganizations,
  setOrganizationActive,
} from "../controllers/superadminController";

const router = Router();

// Todas las rutas de plataforma requieren rol SUPERADMIN.
router.use(authenticate, requireRole("SUPERADMIN"));

router.post("/organizations", createOrganization);
router.get("/organizations", listOrganizations);
router.patch("/organizations/:id/active", setOrganizationActive);

export default router;
