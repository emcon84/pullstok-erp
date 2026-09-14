import { Router } from "express";
import vendorChatController from "../controllers/vendorChatController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { requireRole } from "../middlewares/authMiddleware";

const router = Router();

router.post(
  "/conversations",
  authenticateJWT,
  requireRole("VENDEDOR"),
  vendorChatController.createConversation,
);
router.get(
  "/conversations",
  authenticateJWT,
  requireRole("VENDEDOR"),
  vendorChatController.listConversations,
);
router.get(
  "/conversations/:id",
  authenticateJWT,
  requireRole("VENDEDOR"),
  vendorChatController.getConversation,
);
router.post(
  "/messages",
  authenticateJWT,
  requireRole("VENDEDOR"),
  vendorChatController.postMessage,
);
router.post(
  "/conversations/:id/close",
  authenticateJWT,
  requireRole("VENDEDOR"),
  vendorChatController.closeConversation,
);

export default router;
