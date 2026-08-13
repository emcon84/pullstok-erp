-- Celdas de la planilla "Precios por kilo": un precio por kilo para cada par
-- (marca × tipo). Los nombres de columna DEBEN coincidir con los campos del
-- cliente Prisma (convención camelCase, ej. brandId/typeId/organizationId).
-- onDelete CASCADE en brandId/typeId: borrar una marca o un tipo borra sus
-- celdas (la planilla no deja celdas huérfanas). organizationId RESTRICT: no se
-- borra una organización sin limpiar sus celdas.

-- CreateTable
CREATE TABLE "price_kg_prices" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "priceKg" DOUBLE PRECISION NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_kg_prices_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "price_kg_prices" ADD CONSTRAINT "price_kg_prices_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "price_kg_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_kg_prices" ADD CONSTRAINT "price_kg_prices_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "price_kg_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_kg_prices" ADD CONSTRAINT "price_kg_prices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
-- Una sola celda por par (org, marca, tipo): la @@unique del schema.prisma.
CREATE UNIQUE INDEX "price_kg_prices_organizationId_brandId_typeId_key" ON "price_kg_prices"("organizationId", "brandId", "typeId");

CREATE INDEX "price_kg_prices_organizationId_idx" ON "price_kg_prices"("organizationId");

-- Down (reversible: sin datos críticos)
-- DROP TABLE "price_kg_prices";
