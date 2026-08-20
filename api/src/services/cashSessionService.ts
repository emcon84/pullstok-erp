import { prisma, basePrisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { round2 } from "../utils/money";

/**
 * Caja (sdd/caja-apertura-cierre) — apertura/cierre/arqueo/consulta.
 *
 * CashSession es un modelo TENANT (en TENANT_MODELS, db.ts) → el scope de
 * organización lo inyecta la extensión en findFirst/findMany/updateMany/create
 * (NUNCA findUnique/update). SalePayment NO tiene orgId propio → se scopea vía
 * su CashSession/Sale.
 *
 * Roles operativos (CASHIER/VENDEDOR) resuelven su sucursal de BranchAssignment
 * (una sola, con select); ADMIN/MANAGEMENT la mandan explícita en el body.
 */

const GESTION_ROLES = ["ADMIN", "MANAGEMENT"];
const OPERATIVE_ROLES = ["CASHIER", "VENDEDOR"];

const isGestión = (role?: string) => !!role && GESTION_ROLES.includes(role);
const isOperative = (role?: string) => !!role && OPERATIVE_ROLES.includes(role);

/** Resuelve la sucursal de apertura: asignada (operativos) o explícita (gestión). */
const resolveBranchForOpen = async (
  userId: string | undefined,
  role: string | undefined,
  bodyBranchId?: string,
): Promise<string> => {
  if (userId && isOperative(role)) {
    const assignments = await basePrisma.branchAssignment.findMany({
      where: { userId },
      select: { branchId: true },
    });
    if (assignments.length === 0) {
      const err: any = new Error(
        "No tenés una sucursal asignada. Contactá a un administrador.",
      );
      err.code = "INVALID_BRANCH";
      throw err;
    }
    if (assignments.length > 1) {
      const err: any = new Error(
        "Tenés múltiples sucursales asignadas. Seleccioná una para abrir la caja.",
      );
      err.code = "INVALID_BRANCH";
      throw err;
    }
    return assignments[0].branchId;
  }
  if (!bodyBranchId) {
    const err: any = new Error("branchId es requerido para esta operación");
    err.code = "INVALID_BRANCH";
    throw err;
  }
  return bodyBranchId;
};

interface OpenCashInput {
  branchId?: string;
  openingAmount?: number;
  observations?: string;
}

interface CloseCashInput {
  closingByMethod: Record<string, number>;
  closingAmount?: number;
  observations?: string;
}

const openCash = async (
  input: OpenCashInput,
  userId?: string,
  role?: string,
) => {
  const organizationId = requireOrganizationId();

  const branchId = await resolveBranchForOpen(userId, role, input.branchId);

  // Una sola caja OPEN por (branch, cashier) → validación de service para
  // mensaje limpio (el índice único parcial `cash_session_single_open` es la
  // garantía de DB anti-race, no regenerable por Prisma).
  const existing = await prisma.cashSession.findFirst({
    where: { branchId, cashierId: userId, status: "OPEN" },
  });
  if (existing) {
    const err: any = new Error(
      "Ya tenés una caja abierta en esta sucursal. Cerrá la actual antes de abrir otra.",
    );
    err.code = "CASH_SESSION_ALREADY_OPEN";
    throw err;
  }

  return prisma.cashSession.create({
    data: {
      organizationId,
      branchId,
      cashierId: userId!,
      openingAmount: input.openingAmount ?? 0,
      observations: input.observations,
      status: "OPEN",
    },
  });
};

const closeCash = async (
  id: string,
  input: CloseCashInput,
  userId?: string,
  role?: string,
) => {
  const organizationId = requireOrganizationId();

  const session = await prisma.cashSession.findFirst({ where: { id } });
  if (!session) {
    const err: any = new Error("Caja no encontrada");
    err.code = "CASH_SESSION_NOT_FOUND";
    throw err;
  }
  if (session.status === "CLOSED") {
    const err: any = new Error("La caja ya fue cerrada");
    err.code = "CASH_SESSION_ALREADY_CLOSED";
    throw err;
  }
  // Permiso: el dueño (cashierId == user) o un rol de gestión puede cerrar.
  if (!(session.cashierId === userId || isGestión(role))) {
    const err: any = new Error("No tenés permiso para cerrar esta caja");
    err.code = "FORBIDDEN";
    throw err;
  }

  // Σ por método de los pagos asociados a la sesión (solo EFECTIVO suma al
  // arqueo — R10). SalePayment no es tenant model → orgId explícito en where.
  const byMethod = await prisma.salePayment.groupBy({
    by: ["method"],
    where: { cashSessionId: id, sale: { organizationId } },
    _sum: { amount: true },
  });
  const efectivoSum = byMethod.find((g) => g.method === "EFECTIVO")?._sum?.amount ?? 0;
  const expectedAmount = round2((session.openingAmount ?? 0) + efectivoSum);
  const closingAmount = input.closingAmount ?? expectedAmount;
  const difference = round2(closingAmount - expectedAmount);

  await prisma.$transaction(async (tx) => {
    // CashSession es tenant model → dentro del $transaction (tx sin scope) el
    // orgId se pasa EXPLÍCITO (mismo patrón que priceKgPlan/looseStock).
    await tx.cashSession.updateMany({
      where: { id, organizationId, status: "OPEN" },
      data: {
        expectedAmount,
        closingAmount,
        closingByMethod: input.closingByMethod,
        observations: input.observations,
        closedAt: new Date(),
        status: "CLOSED",
      },
    });
  });

  return { expectedAmount, closingAmount, difference };
};

const getCurrent = async (
  userId?: string,
  role?: string,
  branchId?: string,
) => {
  // Gestión puede consultar por sucursal explícita; operativos solo la propia.
  const where: Record<string, unknown> = { status: "OPEN" };
  if (isGestión(role) && branchId) {
    where.branchId = branchId;
  } else {
    where.cashierId = userId;
  }
  return prisma.cashSession.findFirst({
    where,
    include: { payments: true },
  });
};

const getOne = async (id: string, userId?: string, role?: string) => {
  // Operativos solo ven sus propias cajas → scope por cashierId (no se filtra
  // por dueño después, se escopa en la query para no filtrar existencia).
  // Gestión ve todas (scope org auto de la extensión).
  const where: Record<string, unknown> = { id };
  if (!isGestión(role)) {
    where.cashierId = userId;
  }
  const session = await prisma.cashSession.findFirst({
    where,
    include: { payments: true },
  });
  if (!session) {
    const err: any = new Error("Caja no encontrada");
    err.code = "CASH_SESSION_NOT_FOUND";
    throw err;
  }
  return session;
};

interface ListQuery {
  status?: string;
  branchId?: string;
}

const list = async (query: ListQuery, userId?: string, role?: string) => {
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.branchId) where.branchId = query.branchId;
  // Operativos ven solo sus propias cajas; gestión ve todas (scope org auto).
  if (!isGestión(role)) {
    where.cashierId = userId;
  }
  return prisma.cashSession.findMany({
    where,
    include: { payments: true },
    orderBy: { openedAt: "desc" },
  });
};

export default {
  openCash,
  closeCash,
  getCurrent,
  getOne,
  list,
};
