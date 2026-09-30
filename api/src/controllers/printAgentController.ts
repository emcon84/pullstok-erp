import { Request, Response } from "express";
import { basePrisma, prisma } from "../config/db";
import { AgentRequest } from "../middlewares/agentAuth";
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

/** Máximo de jobs que devuelve cada poll del agente. */
const POLL_LIMIT = 10;

/**
 * Agente autenticado: latido. Actualiza lastSeenAt y, si las reporta, las
 * impresoras locales del SO (para que el admin las mapee). Solo toca SU fila.
 */
export const agentHeartbeat = async (req: AgentRequest, res: Response) => {
  try {
    const { localPrinters } = req.body ?? {};
    await prisma.printAgent.updateMany({
      where: { id: req.agent!.id },
      data: {
        lastSeenAt: new Date(),
        ...(Array.isArray(localPrinters) ? { localPrinters } : {}),
      },
    });
    res.status(200).json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Agente autenticado: jobs pendientes de SUS impresoras (más viejos primero).
 * Antes vence (EXPIRED) los que pasaron su expiresAt: nunca se entregan. El
 * payload viaja en base64 (binario seguro en JSON).
 */
export const agentPollJobs = async (req: AgentRequest, res: Response) => {
  try {
    const agentId = req.agent!.id;
    const now = new Date();

    await prisma.printJob.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lte: now },
        printer: { agentId },
      },
      data: { status: "EXPIRED", completedAt: now },
    });

    const jobs = await prisma.printJob.findMany({
      where: {
        status: "PENDING",
        expiresAt: { gt: now },
        printer: { agentId, isActive: true },
      },
      orderBy: { createdAt: "asc" },
      take: POLL_LIMIT,
      include: { printer: { select: { localName: true, name: true } } },
    });

    res.status(200).json(
      jobs.map((job: any) => ({
        id: job.id,
        printerId: job.printerId,
        localName: job.printer?.localName ?? null,
        printerName: job.printer?.name ?? null,
        payloadBase64: Buffer.from(job.payload).toString("base64"),
        createdAt: job.createdAt,
        expiresAt: job.expiresAt,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Agente autenticado: reporta PRINTED/ERROR. Solo aplica a un job PENDING de SUS
 * impresoras; cualquier otro (ajeno, de otra org, ya cerrado) → 404.
 */
export const agentReportResult = async (req: AgentRequest, res: Response) => {
  try {
    const { status, errorMessage } = req.body ?? {};
    const result = await prisma.printJob.updateMany({
      where: {
        id: req.params.id,
        status: "PENDING",
        printer: { agentId: req.agent!.id },
      },
      data: {
        status,
        completedAt: new Date(),
        ...(status === "ERROR" && errorMessage ? { errorMessage } : {}),
      },
    });
    if (result.count === 0) {
      return res
        .status(404)
        .json({ message: "Trabajo de impresión no encontrado" });
    }
    res.status(200).json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
