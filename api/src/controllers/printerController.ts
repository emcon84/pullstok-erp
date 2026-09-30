import { Response } from "express";
import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { AuthedRequest } from "../middlewares/authMiddleware";
import {
  AGENT_ONLINE_WINDOW_MS,
  PAIRING_TTL_MS,
  generatePairingCode,
  hashPairingCode,
} from "../services/printAgentTokens";

const isOnline = (lastSeenAt?: Date | null): boolean =>
  !!lastSeenAt && Date.now() - lastSeenAt.getTime() < AGENT_ONLINE_WINDOW_MS;

const isDuplicateError = (error: any): boolean =>
  error?.code === "P2002" || !!error?.message?.includes("Unique constraint");

/**
 * Valida que la sucursal y el agente referenciados existan en la org del
 * request (el scope lo inyecta la extensión multi-tenant). Devuelve el mensaje
 * de error o null si están OK.
 */
const checkRefs = async (body: {
  branchId?: string | null;
  agentId?: string | null;
}): Promise<string | null> => {
  if (body.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: body.branchId } });
    if (!branch) return "Sucursal no encontrada";
  }
  if (body.agentId) {
    const agent = await prisma.printAgent.findFirst({ where: { id: body.agentId } });
    if (!agent) return "Agente de impresión no encontrado";
  }
  return null;
};

/** ADMIN/MANAGEMENT: registra una impresora en SU organización. */
export const createPrinter = async (req: AuthedRequest, res: Response) => {
  try {
    const refError = await checkRefs(req.body ?? {});
    if (refError) return res.status(404).json({ message: refError });

    const printer = await prisma.printer.create({
      data: { ...req.body, organizationId: requireOrganizationId() },
    });
    res.status(201).json(printer);
  } catch (error: any) {
    if (isDuplicateError(error)) {
      return res
        .status(409)
        .json({ message: "Ya existe una impresora con ese nombre" });
    }
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN/MANAGEMENT: lista impresoras con el estado online de su agente. */
export const listPrinters = async (_req: AuthedRequest, res: Response) => {
  try {
    const printers = await prisma.printer.findMany({
      include: {
        agent: { select: { id: true, name: true, lastSeenAt: true, localPrinters: true } },
      },
      orderBy: { name: "asc" },
    });
    res.status(200).json(
      printers.map((p: any) => ({ ...p, agentOnline: isOnline(p.agent?.lastSeenAt) })),
    );
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/** ADMIN/MANAGEMENT: actualiza una impresora de SU organización. */
export const updatePrinter = async (req: AuthedRequest, res: Response) => {
  try {
    const refError = await checkRefs(req.body ?? {});
    if (refError) return res.status(404).json({ message: refError });

    const result = await prisma.printer.updateMany({
      where: { id: req.params.id },
      data: req.body,
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Impresora no encontrada" });
    }

    const printer = await prisma.printer.findFirst({ where: { id: req.params.id } });
    res.status(200).json(printer);
  } catch (error: any) {
    if (isDuplicateError(error)) {
      return res
        .status(409)
        .json({ message: "Ya existe una impresora con ese nombre" });
    }
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN/MANAGEMENT: elimina una impresora (y sus jobs, por cascade). */
export const deletePrinter = async (req: AuthedRequest, res: Response) => {
  try {
    const result = await prisma.printer.deleteMany({ where: { id: req.params.id } });
    if (result.count === 0) {
      return res.status(404).json({ message: "Impresora no encontrada" });
    }
    res.status(200).json({ message: "Impresora eliminada" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * ADMIN/MANAGEMENT: lista los agentes de la org con su estado y las impresoras
 * locales que reportaron (para mapearlas). Nunca expone hashes.
 */
export const listAgents = async (_req: AuthedRequest, res: Response) => {
  try {
    const agents = await prisma.printAgent.findMany({
      select: {
        id: true,
        name: true,
        lastSeenAt: true,
        localPrinters: true,
        pairingExpiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    res.status(200).json(
      agents.map(({ pairingExpiresAt, ...a }: any) => ({
        ...a,
        // Sin vencimiento pendiente = ya se emparejó (el código se quema).
        paired: pairingExpiresAt == null,
        online: isOnline(a.lastSeenAt),
      })),
    );
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * ADMIN/MANAGEMENT: crea un agente pendiente y su código de emparejamiento.
 * El código en claro se devuelve UNA sola vez; en la base solo queda su hash.
 */
export const createPairingCode = async (req: AuthedRequest, res: Response) => {
  try {
    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

    const agent = await prisma.printAgent.create({
      data: {
        name: req.body.name,
        organizationId: requireOrganizationId(),
        pairingCodeHash: hashPairingCode(code),
        pairingExpiresAt: expiresAt,
      },
    });

    res.status(201).json({ agentId: agent.id, code, expiresAt });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
