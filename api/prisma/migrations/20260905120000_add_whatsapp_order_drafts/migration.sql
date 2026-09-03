-- FASE 3 del bot de WhatsApp (Kapso): borrador de pedido capturado durante el
-- flujo + campo acumulador en la conversación + origen de pedido WHATSAPP.
--
-- ⚠️ ROLLBACK (no reversible en una sola migración): ALTER TYPE ... ADD VALUE
-- no es removible por Prisma. La reversión de esta migración exige pg_dump
-- restore (mismo criterio que 20260831000000_multipack_units_per_box).

-- Origen de pedido creado al aprobar un borrador del bot de WhatsApp.
ALTER TYPE "OrderSource" ADD VALUE 'WHATSAPP';

-- Estado de revisión del borrador (PENDING_REVIEW / APPROVED / REJECTED).
CREATE TYPE "WhatsAppDraftStatus" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED'
);

-- Acumulador JSON en la conversación: guarda, mensaje a mensaje, el dato que el
-- cliente aporta (orderType, productText, address, paymentMethod...) para armar
-- el borrador al llegar a un estado terminal sin re-parsear el flujo.
ALTER TABLE "conversations" ADD COLUMN "whatsappDraftData" JSONB;

CREATE TABLE "whatsapp_order_drafts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "contactName" TEXT,
    "customerId" TEXT,
    "orderType" TEXT NOT NULL DEFAULT 'otro',
    "productText" TEXT,
    "quantityKg" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "address" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'efectivo',
    "status" "WhatsAppDraftStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_order_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "whatsapp_order_drafts_organizationId_status_createdAt_idx"
    ON "whatsapp_order_drafts"("organizationId", "status", "createdAt");

ALTER TABLE "whatsapp_order_drafts"
    ADD CONSTRAINT "whatsapp_order_drafts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "whatsapp_order_drafts"
    ADD CONSTRAINT "whatsapp_order_drafts_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_order_drafts"
    ADD CONSTRAINT "whatsapp_order_drafts_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "whatsapp_order_drafts"
    ADD CONSTRAINT "whatsapp_order_drafts_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
