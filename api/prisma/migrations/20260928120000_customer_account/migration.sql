-- ═══════════════════════════════════════════════════════════════════════════
-- Cuenta corriente de clientes (cuenta-corriente)
-- ═══════════════════════════════════════════════════════════════════════════
-- Nuevo medio de pago CUENTA_CORRIENTE (la venta queda a deuda del cliente) y
-- libro de movimientos por cliente. Saldo = Σ CHARGE − Σ PAYMENT (por
-- agregación, sin campo denormalizado).

-- 1. Enums
-- (El valor nuevo NO se referencia en ninguna otra sentencia de esta migración.)
ALTER TYPE "PaymentMethod" ADD VALUE 'CUENTA_CORRIENTE';
CREATE TYPE "CustomerAccountMovementType" AS ENUM ('CHARGE', 'PAYMENT');

-- 2. Tabla customer_account_movements
CREATE TABLE "customer_account_movements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "CustomerAccountMovementType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "saleId" TEXT,
    "method" "PaymentMethod",
    "cashSessionId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_account_movements_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE INDEX "customer_account_movements_organizationId_idx" ON "customer_account_movements"("organizationId");
CREATE INDEX "customer_account_movements_customerId_idx" ON "customer_account_movements"("customerId");
CREATE INDEX "customer_account_movements_saleId_idx" ON "customer_account_movements"("saleId");
CREATE INDEX "customer_account_movements_cashSessionId_idx" ON "customer_account_movements"("cashSessionId");

-- FKs
ALTER TABLE "customer_account_movements" ADD CONSTRAINT "customer_account_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_account_movements" ADD CONSTRAINT "customer_account_movements_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_account_movements" ADD CONSTRAINT "customer_account_movements_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_account_movements" ADD CONSTRAINT "customer_account_movements_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- DOWN (reversión)
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP TABLE "customer_account_movements";
-- DROP TYPE "CustomerAccountMovementType";
-- (Postgres no permite quitar un valor de enum: 'CUENTA_CORRIENTE' queda en
--  "PaymentMethod"; es inofensivo si no hay filas que lo usen.)
