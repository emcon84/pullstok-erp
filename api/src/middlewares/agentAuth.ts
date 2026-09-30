import { Request, Response, NextFunction } from "express";
import { basePrisma } from "../config/db";
import { runWithTenant } from "../config/tenantContext";
import { parseAgentToken, verifyAgentToken } from "../services/printAgentTokens";

export interface AgentRequest extends Request {
  agent?: { id: string; organizationId: string; name: string };
}

const unauthorized = (res: Response) =>
  res.status(401).json({ message: "Token de agente inválido." });

/**
 * Autentica al agente de impresión con `Authorization: Bearer <agentId>.<secreto>`
 * (NUNCA por query string ni con el JWT de usuario). Busca al agente por id con
 * basePrisma (todavía no hay tenant), compara el hash en tiempo constante y recién
 * ahí abre el CONTEXTO DE TENANT con la organización del agente: desde ese punto
 * la extensión anti-fuga de Prisma scopea toda consulta a su org.
 * Todos los fallos responden el mismo 401 (no revela si el agente existe).
 */
export const authenticateAgent = async (
  req: AgentRequest,
  res: Response,
  next: NextFunction,
) => {
  const header = req.header("Authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return unauthorized(res);

  const token = match[1];
  const parsed = parseAgentToken(token);
  if (!parsed) return unauthorized(res);

  try {
    const agent = await basePrisma.printAgent.findFirst({
      where: { id: parsed.agentId },
    });
    if (!agent || !verifyAgentToken(token, agent.tokenHash)) {
      return unauthorized(res);
    }

    req.agent = {
      id: agent.id,
      organizationId: agent.organizationId,
      name: agent.name,
    };
    runWithTenant(
      {
        userId: agent.id,
        // Rol mínimo: el agente no es un usuario; ninguna ruta de usuario lo acepta.
        role: "EMPLOYEE",
        organizationId: agent.organizationId,
      },
      () => next(),
    );
  } catch {
    return unauthorized(res);
  }
};
