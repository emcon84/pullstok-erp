import { prisma, basePrisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { round2 } from "../utils/money";
import { sendDocument, normalizePhone } from "./whatsappService";
import { uploadToR2 } from "../config/storage";
import { buildAccountStatementPdf } from "./accountStatementPdf";

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
  date?: Date;
}

export interface UpdateMovementInput {
  amount?: number;
  date?: Date;
  note?: string | null;
}

// Etiqueta para clientes sin nombre (Customer.name es opcional).
const NO_NAME_LABEL = "Sin nombre";

export interface RegisterHistoricalChargeInput {
  amount: number;
  date?: Date;
  note?: string | null;
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
  const nameById = new Map(customers.map((c) => [c.id, c.name?.trim() || NO_NAME_LABEL]));

  return nonZero
    .map((b) => ({
      customerId: b.customerId,
      name: nameById.get(b.customerId) ?? NO_NAME_LABEL,
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

  return {
    customer: { id: customer.id, name: customer.name?.trim() || NO_NAME_LABEL },
    balance,
    movements,
  };
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
        // Without a date the schema default now() applies.
        ...(input.date ? { createdAt: input.date } : {}),
        createdById: userId,
      },
    });

    return { movement, balance: round2(balance - amount) };
  });
};

/**
 * Loads a movement inside the transaction (org + customer scoped) and enforces
 * the editability rules shared by update and delete: only a manual CHARGE
 * (no sale) or a PAYMENT; a cash PAYMENT tied to a non-OPEN cash session would
 * alter a closed cash count.
 */
const loadEditableMovement = async (
  tx: any,
  customerId: string,
  movementId: string,
  organizationId: string,
) => {
  const movement = await tx.customerAccountMovement.findFirst({
    where: { id: movementId, customerId, organizationId },
    include: { cashSession: { select: { status: true } } },
  });
  if (!movement) throw domainError("MOVEMENT_NOT_FOUND", "Movimiento no encontrado");

  if (movement.type === "CHARGE" && movement.saleId) {
    throw domainError(
      "MOVEMENT_IMMUTABLE",
      "Los cargos generados por una venta no se pueden modificar",
    );
  }
  if (movement.method === "EFECTIVO" && movement.cashSession?.status !== "OPEN") {
    throw domainError(
      "CASH_SESSION_CLOSED",
      "La cobranza en efectivo pertenece a una caja cerrada y no se puede modificar",
    );
  }
  return movement;
};

const assertBalanceNotNegative = (balanceAfter: number) => {
  if (balanceAfter < 0) {
    throw domainError(
      "MOVEMENT_BALANCE_NEGATIVE",
      "El cambio dejaría el saldo del cliente en negativo",
    );
  }
};

/**
 * Edits amount / date / note of a manual CHARGE or a PAYMENT (never its method).
 * Runs with the customer locked FOR UPDATE; the resulting balance can't be < 0.
 */
const updateMovement = async (
  customerId: string,
  movementId: string,
  input: UpdateMovementInput,
) => {
  const organizationId = requireOrganizationId();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) throw domainError("CUSTOMER_NOT_FOUND", "Cliente no encontrado");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${customerId} AND "organizationId" = ${organizationId} FOR UPDATE`;

    const movement = await loadEditableMovement(tx, customerId, movementId, organizationId);
    const balance = await computeBalance(tx as unknown as LedgerClient, customerId, organizationId);

    const data: { amount?: number; createdAt?: Date; note?: string | null } = {};
    let balanceAfter = balance;
    if (input.amount !== undefined) {
      const amount = round2(input.amount);
      if (!(amount > 0)) throw domainError("INVALID_MOVEMENT_AMOUNT", "El monto debe ser mayor a 0");
      const delta = amount - movement.amount;
      balanceAfter = round2(balance + (movement.type === "CHARGE" ? delta : -delta));
      data.amount = amount;
    }
    if (input.date !== undefined) data.createdAt = input.date;
    if (input.note !== undefined) data.note = input.note?.trim() || null;
    assertBalanceNotNegative(balanceAfter);

    const updated = await tx.customerAccountMovement.update({ where: { id: movementId }, data });
    return { movement: updated, balance: balanceAfter };
  });
};

/** Hard-deletes a manual CHARGE or a PAYMENT; the resulting balance can't be < 0. */
const deleteMovement = async (customerId: string, movementId: string, _userId?: string) => {
  const organizationId = requireOrganizationId();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) throw domainError("CUSTOMER_NOT_FOUND", "Cliente no encontrado");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${customerId} AND "organizationId" = ${organizationId} FOR UPDATE`;

    const movement = await loadEditableMovement(tx, customerId, movementId, organizationId);
    const balance = await computeBalance(tx as unknown as LedgerClient, customerId, organizationId);

    const balanceAfter = round2(balance + (movement.type === "CHARGE" ? -movement.amount : movement.amount));
    assertBalanceNotNegative(balanceAfter);

    await tx.customerAccountMovement.delete({ where: { id: movementId } });
    return { deletedId: movementId, balance: balanceAfter };
  });
};

/**
 * Registra un cargo histórico (deuda anterior): CHARGE sin venta asociada, con
 * la fecha indicada (default: ahora) y una nota libre opcional. No crea `Sale`
 * (no toca stock, caja ni reportes). Devuelve el movimiento y el saldo nuevo.
 */
const registerHistoricalCharge = async (
  customerId: string,
  input: RegisterHistoricalChargeInput,
  userId?: string,
) => {
  const organizationId = requireOrganizationId();

  const amount = round2(input.amount);
  if (!(amount > 0)) {
    throw domainError("INVALID_CHARGE_AMOUNT", "El monto debe ser mayor a 0");
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) throw domainError("CUSTOMER_NOT_FOUND", "Cliente no encontrado");

  const movement = await prisma.customerAccountMovement.create({
    data: {
      organizationId,
      customerId,
      type: "CHARGE",
      amount,
      saleId: null,
      note: input.note?.trim() || null,
      // Sin fecha → se omite y rige el default now() del schema.
      createdAt: input.date,
      createdById: userId,
    },
  });

  const balance = await computeBalance(prisma, customerId, organizationId);
  return { movement, balance };
};

/**
 * Arma el PDF del resumen de cuenta y lo sube a R2. Org/logo se leen con
 * `basePrisma`: `Organization` y `StoreSettings` NO son TENANT_MODELS (ver
 * db.ts), así que el scope de org se aplica a mano (organizationId / where:
 * { id }). Compartido por `sendAccountStatementWhatsapp` (Kapso, dormant en
 * sandbox) y `getAccountStatementLink` (fallback wa.me activo).
 */
const buildAccountStatementLink = async (
  customerId: string,
): Promise<{ url: string; filename: string; customerName: string }> => {
  const organizationId = requireOrganizationId();

  const { customer, balance, movements } = await getAccount(customerId);

  const [organization, storeSettings] = await Promise.all([
    basePrisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, address: true, phone: true, taxId: true, taxCondition: true },
    }),
    basePrisma.storeSettings.findUnique({
      where: { organizationId },
      select: { logoUrl: true },
    }),
  ]);

  const buffer = await buildAccountStatementPdf({
    customer: { name: customer.name },
    organization: organization ?? { name: "" },
    logoUrl: storeSettings?.logoUrl ?? null,
    balance,
    movements,
  });

  const filename = `estado-cuenta-${customer.name.replace(/\s+/g, "-")}.pdf`;
  const key = `account-statements/${customerId}-${Date.now()}.pdf`;
  const url = await uploadToR2(buffer, key, "application/pdf");

  return { url, filename, customerName: customer.name };
};

/**
 * Genera el PDF del resumen de cuenta (T1) y lo manda por WhatsApp al
 * `Customer.phone` (normalizado) vía Kapso. EN SANDBOX Kapso devuelve 403
 * ("Active sandbox session required") porque no puede empujar mensajes sin
 * que el cliente haya iniciado la conversación — queda dormant hasta que la
 * cuenta de Kapso pase a producción. El botón del front usa
 * `getAccountStatementLink` + wa.me mientras tanto.
 */
const sendAccountStatementWhatsapp = async (customerId: string) => {
  const customer = await prisma.customer.findFirst({ where: { id: customerId } });
  if (!customer) throw domainError("CUSTOMER_NOT_FOUND", "Cliente no encontrado");

  const phone = normalizePhone(customer.phone);
  if (!phone) {
    throw domainError("CUSTOMER_PHONE_REQUIRED", "El cliente no tiene teléfono cargado");
  }

  const { url, filename, customerName } = await buildAccountStatementLink(customerId);

  const sent = await sendDocument(phone, url, filename, `Resumen de cuenta — ${customerName}`);
  if (!sent) {
    throw domainError("WHATSAPP_SEND_FAILED", "No se pudo enviar el comprobante por WhatsApp");
  }

  return { sent: true };
};

/**
 * Fallback mientras Kapso está en sandbox (ver `sendAccountStatementWhatsapp`):
 * arma el PDF y devuelve su URL pública, SIN exigir teléfono ni llamar a
 * Kapso — el front abre un link wa.me con este URL para que el vendedor lo
 * mande a mano.
 */
const getAccountStatementLink = async (
  customerId: string,
): Promise<{ url: string; filename: string }> => {
  const { url, filename } = await buildAccountStatementLink(customerId);
  return { url, filename };
};

export default {
  getBalances,
  getAccount,
  registerPayment,
  registerHistoricalCharge,
  updateMovement,
  deleteMovement,
  sendAccountStatementWhatsapp,
  getAccountStatementLink,
};
