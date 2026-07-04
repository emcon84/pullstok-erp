import { Router } from "express";
import botConfigController from "../controllers/botConfigController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { checkBotEnabled } from "../middlewares/checkBotEnabled";
import { validate } from "../middlewares/validate";
import { botConfigSchema } from "../validation/schemas";

// Config del bot IA para el OPERADOR (ERP). authenticateJWT primero (resuelve el
// contexto de tenant vía AsyncLocalStorage → scope automático por org),
// checkBotEnabled después (necesita requireOrganizationId() ya disponible para
// resolver el plan; el bot es feature PREMIUM).
const router = Router();

router.use(authenticateJWT, checkBotEnabled);

router.get("/config", botConfigController.getBotConfig);
router.put(
  "/config",
  validate(botConfigSchema),
  botConfigController.updateBotConfig,
);

export default router;
