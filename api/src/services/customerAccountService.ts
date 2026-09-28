import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { round2 } from "../utils/money";

/**
 * Cuenta corriente de clientes (cuenta-corriente) — saldo, extracto y cobranzas.
 *
 * CustomerAccountMovement es un modelo TENANT (en TENANT_MODELS, db.ts) → el
 * scope de organización lo inyecta la extensión en las queries del cliente
 * `prisma` (findFirst/findMany/groupBy/create; NUNCA findUnique/update). Dentro
 * de `$transaction` el `tx` NO tiene scope automático → organizationId EXPLÍCITO.
 *
 * Saldo = Σ CHARGE − Σ PAYMENT, siempre por agregación (sin campo denormalizado).
 * Saldo > 0 = el cliente debe plata.
 */

// Medios con los que un cliente puede saldar deuda: nunca CUENTA_CORRIENTE.
const COLLECTION_METHODS = [
  "EFECTIVO",
  "TARJETA_CREDITO",
  "TARJETA_DEBITO",
  "TRANSFERENCIA",
  "QR",
] as const;
type CollectionMethod = (typeof COLLECTION_METHODS)[number];

export interface RegisterPaymentInput {
  amount: number;
  method: CollectionMethod;
  cashSessionId?: string;
  note?: string;
}

const domainError = (code: string, message: string) => {
  const err: any = new Error(message);
  err.code = code;
  return err;
};

// Cliente mínimo con el que se calcula el saldo (sirve para `prisma` y para `tx`).
type LedgerClient = {
  customerAccountMovement: { groupBy: (args: any) => Promise<any[]> };
};

/** Saldo de UN cliente (Σ CHARGE − Σ PAYMENT). organizationId explícito (sirve en tx). */
const computeBalance = async (
  client: LedgerClient,
  customerId: string,
  organizationId: string,
): Promise<number> => {
  const rows = await client.customerAccountMovement.groupBy({
    by: ["type"],
    where: { customerId, organizationId },
    _sum: { amount: true },
  });
  const sumOf = (type: "CHARGE" | "PAYMENT") =>
    rows.find((r) => r.type === type)?._sum?.amount ?? 0;
  return round2(sumOf("CHARGE") - sumOf("PAYMENT"));
};

/** Clientes con saldo != 0 (deudores y con saldo a favor), ordenados por nombre. */
const getBalances = async () => {
  const organizationId = requireOrganizationId();

  const rows = await prisma.customerAccountMovement.groupBy({
    by: ["customerId", "type"],
    where: { organizationId },
    _sum: { amount: true },
  });

  const byCustomer = new Map<string, number>();
  for (const r of rows) {
    const signed = (r._sum?.amount ?? 0) * (r.type === "CHARGE" ? 1 : -1);
    byCustomer.set(r.customerId, (byCustomer.get(r.customerId) ?? 0) + signed);
  }

  const nonZero = [...byCustomer.entries()]
    .map(([customerId, raw]) => ({ customerId, balance: round2(raw) }))
    .filter((b) => b.balance !== 0);
  if (nonZero.length === 0) return [];

  const customers = await prisma.customer.findMany({
    where: { id: { in: nonZero.map((b) => b.customerId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(customers.map((c) => [c.id, c.name]));

  return nonZero
    .map((b) => ({
      customerId: b.customerId,
      name: nameById.get(b.customerId) ?? "",
      balance: b.balance,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** Extracto de un cliente: saldo + movimientos (más nuevos primero). */
const getAccount = async (customerId: string) => {
  const organizationId = requireOrganizationId();

  const customer = await prisma.customer.findFirst({ where: { id: customerId } });
  if (!customer) throw domainError("CUSTOMER_NOT_FOUND", "Cliente no encontrado");

  const [balance, movements] = await Promise.all([
    computeBalance(prisma, customerId, organizationId),
    prisma.customerAccountMovement.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: { sale: { select: { id: true, saleDate: true } } },
    }),
  ]);

  return { customer: { id: customer.id, name: customer.name }, balance, movements };
};

/**
 * Registra una cobranza (PAYMENT). Reglas: método distinto de CUENTA_CORRIENTE;
 * monto ≤ saldo (sin sobrepago); EFECTIVO exige una caja OPEN de la org (la
 * cobranza suma al arqueo de esa caja). El saldo se RE-CHEQUEA dentro de la
 * transacción, con el cliente bloqueado (FOR UPDATE) para que dos cobranzas
 * simultáneas no puedan pasarse del saldo.
 */
const registerPayment = async (
  customerId: string,
  input: RegisterPaymentInput,
  userId?: string,
) => {
  const organizationId = requireOrganizationId();

  if (!(COLLECTION_METHODS as readonly string[]).includes(input.method)) {
    throw domainError("INVALID_PAYMENT_METHOD", "Medio de pago inválido para una cobranza");
  }
  const amount = round2(input.amount);
  if (!(amount > 0)) {
    throw domainError("INVALID_PAYMENT_METHOD", "El monto debe ser mayor a 0");
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) throw domainError("CUSTOMER_NOT_FOUND", "Cliente no encontrado");

  // EFECTIVO → tiene que caer en una caja abierta (si no, el efectivo no
  // aparecería en ningún arqueo). Otros medios no tocan la caja.
  let cashSessionId: string | null = null;
  if (input.method === "EFECTIVO") {
    if (!input.cashSessionId) {
      throw domainError(
        "CASH_SESSION_REQUIRED",
        "Necesitás una caja abierta para registrar una cobranza en efectivo",
      );
    }
    const session = await prisma.cashSession.findFirst({
      where: { id: input.cashSessionId, status: "OPEN" },
      select: { id: true },
    });
    if (!session) {
      throw domainError(
        "CASH_SESSION_REQUIRED",
        "La caja indicada no está abierta. Abrí una caja para cobrar en efectivo",
      );
    }
    cashSessionId = session.id;
  }

  const note = input.note?.trim() || null;

  return prisma.$transaction(async (tx) => {
    // Lock del cliente: serializa cobranzas concurrentes del mismo cliente.
    await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${customerId} AND "organizationId" = ${organizationId} FOR UPDATE`;

    const balance = await computeBalance(tx as unknown as LedgerClient, customerId, organizationId);
    if (amount > balance) {
      throw domainError(
        "PAYMENT_EXCEEDS_BALANCE",
        balance > 0
          ? `El monto supera el saldo adeudado ($${balance.toFixed(2)})`
          : "El cliente no tiene saldo adeudado",
      );
    }

    const movement = await tx.customerAccountMovement.create({
      data: {
        organizationId,
        customerId,
        type: "PAYMENT",
        amount,
        method: input.method,
        cashSessionId,
        note,
        createdById: userId,
      },
    });

    return { movement, balance: round2(balance - amount) };
  });
};

export default { getBalances, getAccount, registerPayment };
