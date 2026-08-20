import { Response } from "express";
import { AuthedRequest } from "../middlewares/authMiddleware";
import cashSessionService from "../services/cashSessionService";

/**
 * Caja (sdd/caja-apertura-cierre). Endpoints:
 *  - POST / (open): abrir caja (fondo inicial, sucursal asignada o explícita).
 *  - POST /:id/close: cerrar/arqueo (conteo real por método vs esperado).
 *  - GET /current: sesión OPEN actual (operativos) o por branch (gestión).
 *  - GET /:id: detalle de una sesión (dueño o gestión).
 *  - GET /: listado (operativos propias; gestión todas).
 *
 * El scope multi-tenant lo inyecta la extensión de Prisma (CashSession en
 * TENANT_MODELS). Los códigos de dominio se mapean a HTTP acá:
 *  CASH_SESSION_NOT_FOUND → 404, CASH_SESSION_ALREADY_OPEN → 409,
 *  CASH_SESSION_ALREADY_CLOSED → 409, FORBIDDEN → 403, INVALID_BRANCH → 400.
 */

const mapDomainError = (res: Response, error: any): boolean => {
  const code = error?.code;
  if (code === "CASH_SESSION_NOT_FOUND") {
    res.status(404).json({ error: code, message: error.message });
    return true;
  }
  if (code === "CASH_SESSION_ALREADY_OPEN" || code === "CASH_SESSION_ALREADY_CLOSED") {
    res.status(409).json({ error: code, message: error.message });
    return true;
  }
  if (code === "FORBIDDEN") {
    res.status(403).json({ error: code, message: error.message });
    return true;
  }
  if (code === "INVALID_BRANCH") {
    res.status(400).json({ error: code, message: error.message });
    return true;
  }
  return false;
};

const openCashSession = async (req: AuthedRequest, res: Response) => {
  try {
    const { branchId, openingAmount, observations } = req.body ?? {};
    const session = await cashSessionService.openCash(
      { branchId, openingAmount, observations },
      req.user?.id,
      req.user?.role,
    );
    return res.status(201).json(session);
  } catch (error: any) {
    if (mapDomainError(res, error)) return;
    console.error("Error en openCashSession:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

const closeCashSession = async (req: AuthedRequest, res: Response) => {
  try {
    const { closingByMethod, closingAmount, observations } = req.body ?? {};
    const result = await cashSessionService.closeCash(
      String(req.params.id),
      { closingByMethod, closingAmount, observations },
      req.user?.id,
      req.user?.role,
    );
    return res.status(200).json(result);
  } catch (error: any) {
    if (mapDomainError(res, error)) return;
    console.error("Error en closeCashSession:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

const getCurrentCashSession = async (req: AuthedRequest, res: Response) => {
  try {
    const branchId = (req.query?.branchId as string) || undefined;
    const session = await cashSessionService.getCurrent(
      req.user?.id,
      req.user?.role,
      branchId,
    );
    return res.status(200).json(session);
  } catch (error: any) {
    console.error("Error en getCurrentCashSession:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

const getCashSession = async (req: AuthedRequest, res: Response) => {
  try {
    const session = await cashSessionService.getOne(
      String(req.params.id),
      req.user?.id,
      req.user?.role,
    );
    return res.status(200).json(session);
  } catch (error: any) {
    if (mapDomainError(res, error)) return;
    console.error("Error en getCashSession:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

const listCashSessions = async (req: AuthedRequest, res: Response) => {
  try {
    const { status, branchId } = req.query as { status?: string; branchId?: string };
    const items = await cashSessionService.list(
      { status, branchId },
      req.user?.id,
      req.user?.role,
    );
    return res.status(200).json({ items });
  } catch (error: any) {
    console.error("Error en listCashSessions:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export {
  openCashSession,
  closeCashSession,
  getCurrentCashSession,
  getCashSession,
  listCashSessions,
};

export default {
  openCashSession,
  closeCashSession,
  getCurrentCashSession,
  getCashSession,
  listCashSessions,
};
