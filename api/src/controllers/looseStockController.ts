import { Request, Response } from "express";
import { prisma, basePrisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { AuthedRequest } from "../middlewares/authMiddleware";
import {
  openBag,
  setLooseStock,
  getLooseStock,
  listLooseStocks,
} from "../services/looseSaleService";

/**
 * Stock de alimento suelto (sdd/loose-lines-stock). Endpoints:
 *  - POST /open-bag: abrir una bolsa → −1 unidad de ProductStock de bolsas,
 *    +weightKg en LooseStock de la celda de la planilla.
 *  - GET /: listar el stock suelto de la org (filtro opcional por sucursal).
 *  - GET /:lineId: una línea.
 *  - PUT /:lineId: ajustar los kg de una línea (ADMIN/MANAGEMENT).
 *
 * Tenant-scoped: LooseStock está en TENANT_MODELS (db.ts) → el scope org lo
 * inyecta la extensión en el request. DENTRO del $transaction el tx NO hereda
 * el scope → orgId EXPLÍCITO en toda query (patrón priceKgPlanController).
 */

const looseCodes422 = [
  "LOOSE_BAG_NOT_FOUND",
  "LOOSE_BAG_NO_WEIGHT",
  "LOOSE_BAG_NO_LINE",
  "LOOSE_LINE_NOT_FOUND",
  "LOOSE_BAG_INSUFFICIENT_STOCK",
  "LOOSE_STOCK_NOT_FOUND",
  "LOOSE_REQUIRES_BRANCH",
];

const serverError = (res: Response, error: any, ctx: string) => {
  console.error(`Error en ${ctx}:`, error);
  return res.status(500).json({ message: "Error interno del servidor" });
};

/** Resuelve la sucursal de la operación: asignada (VENDEDOR/CASHIER) o explícita. */
const resolveBranchId = async (
  req: AuthedRequest,
  bodyBranchId?: string,
): Promise<{ branchId: string; source: "assigned" | "body" }> => {
  const user = req.user;
  if (user && (user.role === "VENDEDOR" || user.role === "CASHIER")) {
    const assignments = await basePrisma.branchAssignment.findMany({
      where: { userId: user.id },
      select: { branchId: true },
    });
    if (assignments.length === 0) {
      const err: any = new Error(
        "No tenés una sucursal asignada. Contactá a un administrador.",
      );
      err.code = "LOOSE_REQUIRES_BRANCH";
      throw err;
    }
    if (assignments.length > 1) {
      const err: any = new Error(
        "Tenés múltiples sucursales asignadas. Seleccioná una para abrir la bolsa.",
      );
      err.code = "LOOSE_REQUIRES_BRANCH";
      throw err;
    }
    return { branchId: assignments[0].branchId, source: "assigned" };
  }
  if (!bodyBranchId) {
    const err: any = new Error("branchId es requerido para esta operación");
    err.code = "LOOSE_REQUIRES_BRANCH";
    throw err;
  }
  return { branchId: bodyBranchId, source: "body" };
};

export const openBagController = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const authed = req as AuthedRequest;
    const { productId, branchId, priceKgPriceId } = req.body as {
      productId: string;
      branchId?: string;
      priceKgPriceId: string;
    };
    const { branchId: resolvedBranchId } = await resolveBranchId(
      authed,
      branchId,
    );

    const result = await prisma.$transaction((tx) =>
      openBag(tx, organizationId, {
        productId,
        branchId: resolvedBranchId,
        priceKgPriceId,
      }),
    );
    return res.status(201).json(result);
  } catch (error: any) {
    if (error?.code && looseCodes422.includes(error.code)) {
      return res.status(422).json({ error: error.code, message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
};

export const listController = async (req: Request, res: Response) => {
  try {
    const { branchId } = req.query as { branchId?: string };
    const items = await listLooseStocks(branchId);
    return res.status(200).json({ items });
  } catch (error: any) {
    return serverError(res, error, "listLooseStocks");
  }
};

export const getController = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const authed = req as AuthedRequest;
    const lineId = String(req.params.lineId ?? "");
    const { branchId: queryBranchId } = req.query as { branchId?: string };

    // La celda debe existir (si no → 404); la fila LooseStock puede no existir
    // todavía (stock 0).
    const cell = await prisma.priceKgPrice.findFirst({
      where: { id: lineId, organizationId },
      select: { id: true },
    });
    if (!cell) {
      return res.status(404).json({ message: "Línea de la planilla no encontrada" });
    }

    // Sucursal: query param o la asignada al vendedor (VENDEDOR/CASHIER).
    let branchId = queryBranchId;
    if (!branchId) {
      const resolved = await resolveBranchId(authed);
      branchId = resolved.branchId;
    }

    const line = await getLooseStock({ lineId, branchId });
    return res.status(200).json(line);
  } catch (error: any) {
    if (error?.code && looseCodes422.includes(error.code)) {
      return res.status(422).json({ error: error.code, message: error.message });
    }
    return serverError(res, error, "getLooseStock");
  }
};

export const setController = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const lineId = String(req.params.lineId ?? "");
    const { branchId, quantity } = req.body as { branchId: string; quantity: number };

    const result = await prisma.$transaction((tx) =>
      setLooseStock(tx, organizationId, { lineId, branchId, quantity }),
    );
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

export default {
  openBag: openBagController,
  list: listController,
  get: getController,
  set: setController,
};