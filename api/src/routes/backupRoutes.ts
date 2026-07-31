import { Router } from "express";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { getLatestBackup } from "../controllers/backupController";

// Backup download: ADMIN only, tenant-scoped via JWT (spec A3, A4).
const router = Router();

router.get(
  "/latest",
  authenticateJWT,
  requireRole("ADMIN"),
  getLatestBackup,
);

export default router;
