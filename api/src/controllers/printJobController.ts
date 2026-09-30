import { Response } from "express";
import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { AGENT_ONLINE_WINDOW_MS } from "../services/printAgentTokens";

/** Tope del ticket ESC/POS ya decodificado (un logo rasterizado entra de sobra). */
export const MAX_PAYLOAD_BYTES = 256 * 1024;
/** Un job que no se imprime en este plazo vence (no se imprimen tickets viejos). */
export const JOB_TTL_MS = 15 * 60 * 1000;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * VENDEDOR/CASHIER/ADMIN/MANAGEMENT: encola un ticket para una impresora de SU
 * organización. El celular genera los bytes ESC/POS; acá solo se validan y se
 * guardan. Responde sin el payload.
 */
export const createPrintJob = async (req: AuthedRequest, res: Response) => {
  try {
    const { printerId, payloadBase64 } = req.body ?? {};

    if (
      typeof payloadBase64 !== "string" ||
      !payloadBase64 ||
      payloadBase64.length % 4 !== 0 ||
      !BASE64_RE.test(payloadBase64)
    ) {
      return res.status(400).json({ message: "El ticket no es un base64 válido" });
    }
    const payload = Buffer.from(payloadBase64, "base64");
    if (payload.length === 0) {
      return res.status(400).json({ message: "El ticket está vacío" });
    }
    if (payload.length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ message: "El ticket es demasiado grande" });
    }

    // Scope de org por la extensión multi-tenant: una impresora de otra org da null.
    const printer = await prisma.printer.findFirst({ where: { id: printerId } });
    if (!printer) {
      return res.status(404).json({ message: "Impresora no encontrada" });
    }
    if (!printer.isActive) {
      return res.status(400).json({ message: "La impresora está desactivada" });
    }

    const job = await prisma.printJob.create({
      data: {
        organizationId: requireOrganizationId(),
        printerId: printer.id,
        branchId: printer.branchId,
        payload,
        expiresAt: new Date(Date.now() + JOB_TTL_MS),
        createdById: req.user?.id ?? null,
      },
    });

    res
      .status(201)
      .json({ id: job.id, status: job.status, expiresAt: job.expiresAt });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Estado de un job (el celular lo consulta por polling). Nunca devuelve el payload. */
export const getPrintJob = async (req: AuthedRequest, res: Response) => {
  try {
    const job = await prisma.printJob.findFirst({
      where: { id: req.params.id },
      select: {
        id: true,
        printerId: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        expiresAt: true,
        completedAt: true,
      },
    });
    if (!job) {
      return res.status(404).json({ message: "Trabajo de impresión no encontrado" });
    }

    // El vencimiento se persiste recién cuando el agente consulta; mientras tanto
    // un PENDING vencido ya se informa como EXPIRED.
    const status =
      job.status === "PENDING" && job.expiresAt.getTime() <= Date.now()
        ? "EXPIRED"
        : job.status;
    res.status(200).json({ ...job, status });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * VENDEDOR/CASHIER/ADMIN/MANAGEMENT: impresoras ACTIVAS de la org para elegir a
 * dónde imprimir desde el celular. Proyección mínima (sin agente ni nombres
 * locales de Windows): el alta/edición sigue siendo de ADMIN/MANAGEMENT.
 */
export const listActivePrinters = async (_req: AuthedRequest, res: Response) => {
  try {
    const printers = await prisma.printer.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        branchId: true,
        agent: { select: { lastSeenAt: true } },
      },
      orderBy: { name: "asc" },
    });
    res.status(200).json(
      printers.map((p: any) => ({
        id: p.id,
        name: p.name,
        branchId: p.branchId ?? null,
        agentOnline:
          !!p.agent?.lastSeenAt &&
          Date.now() - new Date(p.agent.lastSeenAt).getTime() < AGENT_ONLINE_WINDOW_MS,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
