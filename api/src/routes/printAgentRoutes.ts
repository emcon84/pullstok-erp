import { Router } from "express";
import { validate } from "../middlewares/validate";
import { authenticateAgent } from "../middlewares/agentAuth";
import {
  pairAgentSchema,
  agentHeartbeatSchema,
  agentJobResultSchema,
} from "../validation/schemas";
import {
  pairAgent,
  agentHeartbeat,
  agentPollJobs,
  agentReportResult,
} from "../controllers/printAgentController";

const router = Router();

// Endpoints del agente de impresión. SIN JWT de usuario y SIN checkBusinessHours
// (el agente corre aunque el negocio esté fuera de horario).

// Público: canjea el código de emparejamiento por el token del agente.
router.post("/pair", validate(pairAgentSchema), pairAgent);

// Autenticados con el token del agente (Authorization: Bearer <token>).
router.post("/heartbeat", authenticateAgent, validate(agentHeartbeatSchema), agentHeartbeat);
router.get("/jobs", authenticateAgent, agentPollJobs);
router.post("/jobs/:id/result", authenticateAgent, validate(agentJobResultSchema), agentReportResult);

export default router;
