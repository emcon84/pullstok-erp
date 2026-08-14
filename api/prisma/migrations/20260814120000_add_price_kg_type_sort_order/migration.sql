-- Orden de aparición de los tipos en la planilla de precios por kilo.
-- Columna camelCase (convención del proyecto). Default 1000 → los tipos
-- nuevos caen al final; el seed en prod asigna 10, 20, 30... por tipo.

-- AlterTable
ALTER TABLE "price_kg_types" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 1000;

-- Down (reversible: sin datos críticos)
-- ALTER TABLE "price_kg_types" DROP COLUMN "sortOrder";