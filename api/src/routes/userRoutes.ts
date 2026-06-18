import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/authMiddleware";
import {
  createUser,
  listUsers,
  setUserActive,
} from "../controllers/userController";

const router = Router();

// La gestión de usuarios del negocio es solo para el ADMIN de la organización.
router.use(authenticate, requireRole("ADMIN"));

router.post("/", createUser);
router.get("/", listUsers);
router.patch("/:id/active", setUserActive);

export default router;
