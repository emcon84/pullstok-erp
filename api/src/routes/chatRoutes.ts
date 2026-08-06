import { Router } from "express";
import chatController from "../controllers/chatController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";
import { validate } from "../middlewares/validate";
import { chatMessageSchema } from "../validation/schemas";

// Rutas del chat para el OPERADOR (ERP). Todas detrás de authenticateJWT →
// scope automático por org (extensión anti-fuga de Prisma). El operador solo
// ve/escribe conversaciones de SU organización.
const router = Router();

router.get(
  "/conversations",
  authenticateJWT,
  checkBusinessHours,
  chatController.getConversations,
);
router.get(
  "/conversations/:id/messages",
  authenticateJWT,
  checkBusinessHours,
  chatController.getMessages,
);
router.post(
  "/conversations/:id/messages",
  authenticateJWT,
  checkBusinessHours,
  validate(chatMessageSchema),
  chatController.postOperatorMessage,
);

export default router;
