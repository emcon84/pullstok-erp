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

/**
 * Resuelve la sucursal de un operativo (CASHIER/VENDEDOR) desde su asignación:
 * exactamente una. Si 0 o >1 → INVALID_BRANCH. Lo usan apertura, current, getOne
 * y list (la caja es compartida por sucursal: el operativo ve/vende en la caja
 * de SU sucursal, sin importar quién la abrió).
 */
const resolveOperativeBranch = async (
  userId: string | undefined,
): Promise<string> => {
  if (!userId) {
    const err: any = new Error("branchId es requerido para esta operación");
    err.code = "INVALID_BRANCH";
    throw err;
  }
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
      "Tenés múltiples sucursales asignadas. Seleccioná una para esta operación.",
    );
    err.code = "INVALID_BRANCH";
    throw err;
  }
  return assignments[0].branchId;
};

/** Resuelve la sucursal de apertura: asignada (operativos) o explícita (gestión). */
const resolveBranchForOpen = async (
  userId: string | undefined,
  role: string | undefined,
  bodyBranchId?: string,
): Promise<string> => {
  if (userId && isOperative(role)) {
    return resolveOperativeBranch(userId);
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

  // Una sola caja OPEN por sucursal (compartida) → validación de service para
  // mensaje limpio (el índice único parcial `cash_session_single_open` por
  // branchId es la garantía de DB anti-race, no regenerable por Prisma).
  // cashierId sigue siendo quién la abrió (auditoría), no quién puede vender.
  const existing = await prisma.cashSession.findFirst({
    where: { branchId, status: "OPEN" },
  });
  if (existing) {
    const err: any = new Error(
      "Ya hay una caja abierta en esta sucursal. Cerrá la actual antes de abrir otra.",
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
  // Caja compartida por sucursal: la sesión OPEN se resuelve por branch.
  // Gestión puede consultar por sucursal explícita; operativos ven la de SU
  // sucursal (asignación) aunque no la hayan abierto ellos.
  const where: Record<string, unknown> = { status: "OPEN" };
  if (branchId) {
    where.branchId = branchId;               // gestión con sucursal u operativo con sucursal
  } else if (isOperative(role)) {
    where.branchId = await resolveOperativeBranch(userId); // operativo sin branchId → asignación
  } else {
    where.cashierId = userId;                // gestión sin sucursal → su propia (edge)
  }
  return prisma.cashSession.findFirst({
    where,
    include: { payments: true },
  });
};

const getOne = async (id: string, userId?: string, role?: string) => {
  // Caja compartida: los operativos solo ven cajas de SU sucursal (asignación),
  // no solo las que abrieron. Gestión ve todas (scope org auto de la extensión).
  const where: Record<string, unknown> = { id };
  if (!isGestión(role)) {
    where.branchId = await resolveOperativeBranch(userId);
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
  // Operativos ven las cajas de su sucursal (compartida); gestión filtra por
  // branchId opcional o ve todas (scope org auto).
  if (!isGestión(role)) {
    where.branchId = await resolveOperativeBranch(userId);
  } else if (query.branchId) {
    where.branchId = query.branchId;
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
