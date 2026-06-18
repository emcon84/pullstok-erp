import { Router } from "express";
import { login, refresh, changePassword } from "../controllers/authController";
import { authenticate } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import {
  loginSchema,
  refreshSchema,
  changePasswordSchema,
} from "../validation/schemas";

const router = Router();

router.post("/login", validate(loginSchema), login);
router.post("/refresh", validate(refreshSchema), refresh);
router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  changePassword,
);

export default router;
