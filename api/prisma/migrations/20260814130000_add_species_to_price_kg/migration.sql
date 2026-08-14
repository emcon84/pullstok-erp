-- Especie de la planilla de "Precios por kilo" (PERRO | GATO | AMBOS) para
-- tipos y marcas (sdd/price-kg-plan): la matriz se edita por especie (Perros
-- vs Gatos), así que cada tipo/marca declara a qué planilla aplica.
-- Columna camelCase (convención del proyecto). La almacenamos como TEXT NOT
-- NULL (el enum Species se mantiene a nivel app en Prisma/Zod; el CHECK de DB
-- se omite a propósito: el codebase valida siempre con Zod antes de persistir).
-- Default 'PERRO': los registros legacy caen en la planilla de perros sin
-- datos que migrar.

-- AlterTable
ALTER TABLE "price_kg_types" ADD COLUMN "species" TEXT NOT NULL DEFAULT 'PERRO';
ALTER TABLE "price_kg_brands" ADD COLUMN "species" TEXT NOT NULL DEFAULT 'PERRO';

-- Down (reversible: sin datos críticos)
-- ALTER TABLE "price_kg_types" DROP COLUMN "species";
-- ALTER TABLE "price_kg_brands" DROP COLUMN "species";