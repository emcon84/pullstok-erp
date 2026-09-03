import { Router } from "express";
import { landingChat } from "../controllers/landingChatController";

const router = Router();

// Público: sin authenticateJWT (es el asistente de la landing). Requiere CORS.
router.post("/", landingChat);

export default router;
