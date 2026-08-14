-- Especie de la celda de la planilla de "Precios por kilo" (sdd/price-kg-plan):
-- la matriz se edita por especie (Perros vs Gatos) y una marca/tipo AMBOS
-- aparece en ambas planillas con precios independientes. Hasta acá la celda era
-- única por (org, marca, tipo) → editar Gatos pisaba el precio de Perros. Con
-- este cambio la celda pasa a ser única por (org, marca, tipo, especie).
--
-- El tipo "Species" YA existe (lo creó la migración 20260814140000 como enum
-- nativo PERRO/GATO/AMBOS), así que no se vuelve a crear. Default 'PERRO': las
-- celdas existentes (la planilla actual, ~140 celdas) caen en la planilla de
-- perros sin datos que migrar (opción A del diseño).

-- AlterTable
ALTER TABLE "price_kg_prices" ADD COLUMN "species" "Species" NOT NULL DEFAULT 'PERRO';

-- DropIndex: el índice viejo (org, marca, tipo) deja de ser suficiente porque
-- ahora pueden existir dos celdas para el mismo par marca+tipo (una por
-- especie) → se reemplaza por el nuevo que agrega species a la unicidad.
DROP INDEX "price_kg_prices_organizationId_brandId_typeId_key";

-- CreateIndex: una sola celda por (org, marca, tipo, especie): la @@unique del
-- schema.prisma.
CREATE UNIQUE INDEX "price_kg_prices_organizationId_brandId_typeId_species_key" ON "price_kg_prices"("organizationId", "brandId", "typeId", "species");

-- Down (reversible: sin datos críticos — se pierde la separación por especie y
-- las celdas GATO colisionan al re-crear el índice único viejo)
-- DROP INDEX "price_kg_prices_organizationId_brandId_typeId_species_key";
-- CREATE UNIQUE INDEX "price_kg_prices_organizationId_brandId_typeId_key" ON "price_kg_prices"("organizationId", "brandId", "typeId");
-- ALTER TABLE "price_kg_prices" DROP COLUMN "species";