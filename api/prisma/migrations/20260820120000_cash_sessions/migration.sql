-- ═══════════════════════════════════════════════════════════════════════════
-- Caja: apertura/cierre + desglose de medios de pago (sdd/caja-apertura-cierre)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Tipos
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TARJETA_CREDITO', 'TARJETA_DEBITO', 'TRANSFERENCIA', 'QR');
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- 2. Tabla cash_sessions
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedAmount" DOUBLE PRECISION,
    "closingAmount" DOUBLE PRECISION,
    "closingByMethod" JSONB,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE INDEX "cash_sessions_branchId_status_idx" ON "cash_sessions"("branchId", "status");
CREATE INDEX "cash_sessions_cashierId_status_idx" ON "cash_sessions"("cashierId", "status");
CREATE INDEX "cash_sessions_organizationId_idx" ON "cash_sessions"("organizationId");

-- FKs
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Tabla sale_payments (desglose de medios de pago por venta)
CREATE TABLE "sale_payments" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "cashSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE INDEX "sale_payments_saleId_idx" ON "sale_payments"("saleId");
CREATE INDEX "sale_payments_cashSessionId_idx" ON "sale_payments"("cashSessionId");

-- FKs
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Sale.cashSessionId (FK nullable = backward-compat; ventas legacy/admin = null)
ALTER TABLE "sales" ADD COLUMN "cashSessionId" TEXT;
CREATE INDEX "sales_cashSessionId_idx" ON "sales"("cashSessionId");
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- ÍNDICE ÚNICO PARCIAL — una sola caja OPEN por (branch, cashier)
-- ═══════════════════════════════════════════════════════════════════════════
-- Garantiza a nivel DB que NO puede haber más de una CashSession con
-- status='OPEN' para el mismo par (branchId, cashierId), eliminando races.
--
-- ⚠️  IMPORTANTE: NO EDITAR NI REGENERAR este índice en futuras migraciones.
-- Prisma NO puede expresar índices parciales en schema.prisma, así que este
-- CREATE UNIQUE INDEX se agregó a mano (mismo patrón que
-- `branch_single_headquarters` en 20260731191410_add_product_stock_and_headquarters)
-- y `prisma migrate dev` NO lo conoce. Si regenerás migraciones desde el
-- schema, Prisma no lo va a dropear ni recrear (no aparece en el diff), pero
-- tampoco lo va a crear de nuevo: si borrás esta línea, la garantía se pierde.
-- Mantenelo tal cual, con este MISMO nombre.
CREATE UNIQUE INDEX "cash_session_single_open" ON "cash_sessions"("branchId", "cashierId") WHERE "status" = 'OPEN';

-- 5. Backfill: las ventas legacy quedan con cashSessionId = NULL (sin tocar).
--    Los pagos legacy no existen; las ventas nuevas declaran payments.

-- ═══════════════════════════════════════════════════════════════════════════
-- DOWN (reversión completa)
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP INDEX "cash_session_single_open";
-- DROP TABLE "sale_payments";
-- DROP TABLE "cash_sessions";
-- ALTER TABLE "sales" DROP COLUMN IF EXISTS "cashSessionId";
-- DROP TYPE "PaymentMethod";
-- DROP TYPE "CashSessionStatus";
