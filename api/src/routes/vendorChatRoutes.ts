import { Router } from "express";
import vendorChatController from "../controllers/vendorChatController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { requireRole } from "../middlewares/authMiddleware";

const router = Router();

// El widget se renderiza para vendedor/cajero (Dashboard single-branch) y
// para admin/management (Dashboard org-wide) — ver views/Dashboard.tsx.
// Los 4 roles tienen que estar habilitados acá o el widget queda "muerto"
// (llamadas con 403 silencioso) para quien no sea VENDEDOR.
const VENDOR_CHAT_ROLES = ["VENDEDOR", "CASHIER", "ADMIN", "MANAGEMENT"] as const;

router.post(
  "/conversations",
  authenticateJWT,
  requireRole(...VENDOR_CHAT_ROLES),
  vendorChatController.createConversation,
);
router.get(
  "/conversations",
  authenticateJWT,
  requireRole(...VENDOR_CHAT_ROLES),
  vendorChatController.listConversations,
);
router.get(
  "/conversations/:id",
  authenticateJWT,
  requireRole(...VENDOR_CHAT_ROLES),
  vendorChatController.getConversation,
);
router.post(
  "/messages",
  authenticateJWT,
  requireRole(...VENDOR_CHAT_ROLES),
  vendorChatController.postMessage,
);
router.post(
  "/conversations/:id/close",
  authenticateJWT,
  requireRole(...VENDOR_CHAT_ROLES),
  vendorChatController.closeConversation,
);
router.delete(
  "/conversations/:id",
  authenticateJWT,
  requireRole(...VENDOR_CHAT_ROLES),
  vendorChatController.deleteConversation,
);

export default router;
