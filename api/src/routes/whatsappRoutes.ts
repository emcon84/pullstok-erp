import { Router } from "express";
import { handleWebhook } from "../controllers/whatsappController";

const router = Router();

// Público SIN auth: Kapso pega acá con la firma verificada en el controller.
router.post("/webhook", handleWebhook);

export default router;
