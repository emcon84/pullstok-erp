-- sdd/loose-lines-stock — stock de alimento SUELTO por línea de la planilla
-- (celda PriceKgPrice) y por sucursal, + venta suelta desacoplada del producto.
--
-- ORDEN DEL DEPLOY (importante — la migración es mixta):
--   1) PARTE ADITIVA: tabla loose_stocks nueva + columnas nullable
--      (sale_items.productId pasa a nullable, loosePriceId nueva). Backwards
--      compatible: el código viejo puede leer/escribir con esto presente.
--   2) DATA MIGRATION: product_stocks.quantity se convierte de kg a BOLSAS
--      (units) — revierte el backfill kg que hizo 20260810000000_loose_sale.
--      A partir de acá el stock de sucursal vuelve a bookkeep BOLSAS enteras y
--      el peso suelto vive SOLO en loose_stocks (abrir bolsa = -1 unidad /
--      +weightKg suelto; vender suelto = -kg de loose_stocks).
--
-- ⚠️ ROLLBACK: la data migration NO es reversible por SQL (divide stock). El
-- rollback real = restore del pg_dump + redeploy del build anterior (single
-- release, no partial rollback — patrón de 20260810000000_loose_sale).

-- CreateTable (loose_stocks: stock suelto por celda + sucursal)
CREATE TABLE "loose_stocks" (
    "id" TEXT NOT NULL,
    "priceKgPriceId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "loose_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Una sola fila por par (org, celda, sucursal): la @@unique del schema.prisma.
CREATE UNIQUE INDEX "loose_stocks_priceKgPriceId_branchId_key" ON "loose_stocks"("priceKgPriceId", "branchId");

CREATE INDEX "loose_stocks_branchId_idx" ON "loose_stocks"("branchId");

-- AddForeignKey
ALTER TABLE "loose_stocks" ADD CONSTRAINT "loose_stocks_priceKgPriceId_fkey" FOREIGN KEY ("priceKgPriceId") REFERENCES "price_kg_prices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loose_stocks" ADD CONSTRAINT "loose_stocks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loose_stocks" ADD CONSTRAINT "loose_stocks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable (SaleItem — venta suelta sin producto físico)
ALTER TABLE "sale_items" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "sale_items" ADD COLUMN "loosePriceId" TEXT;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_loosePriceId_fkey" FOREIGN KEY ("loosePriceId") REFERENCES "price_kg_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── DATA MIGRATION: stock de bolsas de vuelta a UNIDADES ──
-- 20260810000000_loose_sale convirtió product_stocks.quantity a kg (multiplicó
-- por weightKg). Ahora el suelto vive en loose_stocks, así que el stock de
-- sucursal vuelve a bookkeep BOLSAS enteras: quantity = ROUND(kg / weightKg).
-- Solo filas cuyo producto tiene weightKg > 0 (peso conocido); el resto queda
-- igual (ya está en bolsas o no aplica).
UPDATE "product_stocks"
SET "quantity" = ROUND("product_stocks"."quantity" / p."weightKg")
FROM "products" p
WHERE p."id" = "product_stocks"."productId" AND p."weightKg" > 0;

-- Down (reversible sin datos críticos)
-- DROP TABLE "loose_stocks";
-- ALTER TABLE "sale_items" DROP CONSTRAINT "sale_items_loosePriceId_fkey";
-- ALTER TABLE "sale_items" DROP COLUMN "loosePriceId";
-- ALTER TABLE "sale_items" ALTER COLUMN "productId" SET NOT NULL;
-- ⚠️ La data migration de product_stocks (kg → bolsas) NO se revierte por SQL:
-- el rollback real es restore del pg_dump + redeploy del build anterior.
