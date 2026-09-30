import { Request, Response } from "express";
import { basePrisma } from "../config/db";
import {
  generateAgentToken,
  hashAgentToken,
  hashPairingCode,
} from "../services/printAgentTokens";

/**
 * PÚBLICO (sin JWT de usuario): el agente canjea el código de emparejamiento
 * por su token. Corre SIN contexto de tenant (la org sale del agente pendiente),
 * por eso usa basePrisma. El código se quema en el mismo updateMany (condicionado
 * al hash) → un segundo canje concurrente no obtiene token.
 */
export const pairAgent = async (req: Request, res: Response) => {
  try {
    const codeHash = hashPairingCode(String(req.body?.code ?? ""));

    const agent = await basePrisma.printAgent.findFirst({
      where: { pairingCodeHash: codeHash, pairingExpiresAt: { gt: new Date() } },
    });
    if (!agent) {
      return res
        .status(400)
        .json({ message: "Código de emparejamiento inválido o vencido" });
    }

    const agentToken = generateAgentToken(agent.id);
    const result = await basePrisma.printAgent.updateMany({
      where: { id: agent.id, pairingCodeHash: codeHash },
      data: {
        tokenHash: hashAgentToken(agentToken),
        pairingCodeHash: null,
        pairingExpiresAt: null,
        lastSeenAt: new Date(),
      },
    });
    if (result.count === 0) {
      return res
        .status(400)
        .json({ message: "Código de emparejamiento inválido o vencido" });
    }

    res.status(200).json({ agentId: agent.id, agentToken, name: agent.name });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
