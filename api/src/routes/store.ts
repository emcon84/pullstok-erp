import { Router } from "express";
import rateLimit from "express-rate-limit";
import storeController from "../controllers/storeController";
import chatController from "../controllers/chatController";
import { tenantBySlug } from "../middlewares/tenantBySlug";
import { checkStoreEnabled } from "../middlewares/checkStoreEnabled";
import { requireGuest } from "../middlewares/requireGuest";
import { validate } from "../middlewares/validate";
import {
  checkoutSchema,
  chatStartSchema,
  chatMessageSchema,
} from "../validation/schemas";

// Router PÚBLICO de la tienda online (negocio.pullstok.com/api/store/...).
// Sin authenticateJWT: el tenant se resuelve por slug de subdominio, no por
// JWT. tenantBySlug corre primero (resuelve req.org + tenant context),
// checkStoreEnabled después (necesita req.org.plan, ya resuelto sin query
// extra).
const router = Router();

router.use(tenantBySlug, checkStoreEnabled);

// Anti-spam v1 (deuda documentada en el design: in-memory, no comparte
// estado entre instancias PM2 — alcanza para v1, no bloqueante). Solo en
// checkout, que es el único endpoint que escribe.
const checkoutRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos de compra. Probá de nuevo en unos minutos." },
});

router.get("/products", storeController.getProducts);
router.get("/products/:id", storeController.getProductById);
router.get("/settings", storeController.getSettings);
router.post(
  "/checkout",
  checkoutRateLimit,
  validate(checkoutSchema),
  storeController.checkout,
);

// Chat cliente↔operador (FASE A). /start emite el guest token; /message escribe
// en la conversación del token (requireGuest). El mismo rate limit que checkout
// protege el envío de mensajes del anti-spam.
router.post("/chat/start", validate(chatStartSchema), chatController.startChat);
router.post(
  "/chat/message",
  checkoutRateLimit,
  requireGuest,
  validate(chatMessageSchema),
  chatController.postGuestMessage,
);
// FASE 2 — handoff MANUAL: el visitante pide hablar con una persona desde el
// widget. Solo requireGuest (el token trae conversationId + org); sin body.
router.post("/chat/escalate", requireGuest, chatController.escalateChat);

export default router;
