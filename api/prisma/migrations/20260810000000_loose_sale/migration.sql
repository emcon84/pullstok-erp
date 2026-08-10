-- ═══════════════════════════════════════════════════════════════════════════
-- sdd/venta-alimento-suelto — venta de alimento suelto por peso / monto
--
-- ORDEN DEL DEPLOY (importante — la migración es mixta):
--   1) Parte ADITIVA primero: nuevas columnas nullable + PricingSetting +
--      enum SaleMode + columna saleMode con DEFAULT. Backwards compatible:
--      el código viejo puede leer/escribir con estas columnas presentes
--      (nuevas columnas nullable, enum recién creado, saleMode default
--      BOLSA_CERRADA para filas legacy).
--   2) Los ALTER TYPE (Int→DOUBLE PRECISION sobre sale_items.quantity y
--      product_stocks.quantity) van DESPUÉS de la parte aditiva: el cast
--      nativo de PG es lossless desde Int, pero agruparlo al final deja la
--      migración como "machine-ordered" si Prisma la compara.
--
-- ⚠️ ROLLBACK (B-03/B-06): los ALTER TYPE NO son aditivos. Rollback = restore
-- del pg_dump + redeploy del build anterior (single release, no partial
-- rollback — ver D1 del design y T-03 del spec).
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "SaleMode" AS ENUM ('BOLSA_CERRADA', 'POR_PESO', 'POR_MONTO');

-- AlterTable (Product — columnas aditivas, nullable, sin data migration)
ALTER TABLE "products" ADD COLUMN "priceKgSuelto" DOUBLE PRECISION,
ADD COLUMN "bulkFactor" DOUBLE PRECISION,
ADD COLUMN "weightKg" DOUBLE PRECISION;

-- CreateTable (PricingSetting — org 1:1, OUTSIDE TENANT_MODELS, basePrisma)
CREATE TABLE "pricing_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bulkFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.20,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_settings_organizationId_key" ON "pricing_settings"("organizationId");

-- AddForeignKey
ALTER TABLE "pricing_settings" ADD CONSTRAINT "pricing_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable (SaleItem — saleMode con DEFAULT BOLSA_CERRADA para filas legacy)
ALTER TABLE "sale_items" ADD COLUMN "saleMode" "SaleMode" NOT NULL DEFAULT 'BOLSA_CERRADA';

-- ── PARTE NO ADITIVA: widen Int → DOUBLE PRECISION (cast nativo lossless) ──
-- SaleItem.quantity (B-03) y ProductStock.quantity (B-06, deviation
-- user-confirmed). Rows existentes: enteros pasan a float sin pérdida.
-- Product.quantity (products.quantity) SIGUE Int por constraint (legacy HQ
-- stock sync — comentario L240-243 del schema).
ALTER TABLE "sale_items" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "product_stocks" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;