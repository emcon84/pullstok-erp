-- Convierte species de TEXT a tipo enum nativo "Species" (PERRO | GATO | AMBOS).
--
-- La migración 20260814130000 creó las columnas como TEXT, pero el enum Prisma
-- `Species` se materializa como tipo enum nativo de Postgres y Prisma castea
-- los parámetros a ese tipo al escribir (updateMany/create). Con columnas TEXT,
-- cualquier UPDATE de species falla con `type "public.Species" does not exist`.
-- Los valores existentes ('PERRO'/'GATO'/'AMBOS') ya son válidos en el enum,
-- así que el USING castea sin pérdida.

-- CreateEnum
CREATE TYPE "Species" AS ENUM ('PERRO', 'GATO', 'AMBOS');

-- AlterTable
ALTER TABLE "price_kg_types" ALTER COLUMN "species" TYPE "Species" USING "species"::"Species";
ALTER TABLE "price_kg_brands" ALTER COLUMN "species" TYPE "Species" USING "species"::"Species";

-- Down (reversible: sin datos críticos)
-- ALTER TABLE "price_kg_brands" ALTER COLUMN "species" TYPE TEXT USING "species"::TEXT;
-- ALTER TABLE "price_kg_types" ALTER COLUMN "species" TYPE TEXT USING "species"::TEXT;
-- DROP TYPE "Species";