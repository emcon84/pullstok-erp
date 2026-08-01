-- CreateTable
CREATE TABLE "product_stocks" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "product_stocks_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "branches" ADD COLUMN "isHeadquarters" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "product_stocks_productId_branchId_key" ON "product_stocks"("productId", "branchId");

-- CreateIndex
CREATE INDEX "product_stocks_branchId_idx" ON "product_stocks"("branchId");

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- ÍNDICE ÚNICO PARCIAL — casa central (NO expresable en Prisma)
-- ═══════════════════════════════════════════════════════════════════════════
-- Garantiza EXACTAMENTE UNA Branch con isHeadquarters=true por organización.
--
-- ⚠️  IMPORTANTE: NO EDITAR NI REGENERAR este índice en futuras migraciones.
-- Prisma NO puede expresar índices parciales en schema.prisma, así que este
-- CREATE UNIQUE INDEX se agregó a mano y `prisma migrate dev` NO lo conoce.
-- Si regenerás migraciones desde el schema, Prisma no lo va a dropear ni
-- recrear (no aparece en el diff), pero tampoco lo va a crear de nuevo: si
-- borrás esta línea, la garantía de "una sola casa central por org" se pierde.
-- Mantenelo tal cual, con este MISMO nombre.
CREATE UNIQUE INDEX "branch_single_headquarters" ON "branches"("organizationId") WHERE "isHeadquarters" = true;
