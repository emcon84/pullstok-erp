import { Router } from "express";
import { validate } from "../middlewares/validate";
import { pairAgentSchema } from "../validation/schemas";
import { pairAgent } from "../controllers/printAgentController";

const router = Router();

// Endpoints del agente de impresión. SIN JWT de usuario y SIN checkBusinessHours
// (el agente corre aunque el negocio esté fuera de horario).
router.post("/pair", validate(pairAgentSchema), pairAgent);

export default router;
