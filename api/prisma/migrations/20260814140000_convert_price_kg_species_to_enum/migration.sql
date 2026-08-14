-- Convierte species de TEXT a tipo enum nativo "Species" (PERRO | GATO | AMBOS).
--
-- La migración 20260814130000 creó las columnas como TEXT, pero el enum Prisma
-- `Species` se materializa como tipo enum nativo de Postgres y Prisma castea
-- los parámetros a ese tipo al escribir (updateMany/create). Con columnas TEXT,
-- cualquier UPDATE de species falla con `type "public.Species" does not exist`.
-- Los valores existentes ('PERRO'/'GATO'/'AMBOS') ya son válidos en el enum,
-- así que el USING castea sin pérdida.
--
-- Ojo con el DEFAULT: el default existente es el literal TEXT 'PERRO' y Postgres
-- no lo castea solo al cambiar el tipo de la columna (P3018/42804) — por eso
-- primero se dropea, se altera el tipo y se re-agrega como enum.

-- CreateEnum (condicional: un intento previo de esta misma migración pudo
-- haber dejado el tipo creado antes de fallar en el ALTER TABLE; el deploy
-- debe ser re-ejecutable sin chocar con `type "Species" already exists`).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Species') THEN
    CREATE TYPE "Species" AS ENUM ('PERRO', 'GATO', 'AMBOS');
  END IF;
END $$;

-- AlterTable (drop default → alter type → restore default)
ALTER TABLE "price_kg_types" ALTER COLUMN "species" DROP DEFAULT;
ALTER TABLE "price_kg_types" ALTER COLUMN "species" TYPE "Species" USING "species"::"Species";
ALTER TABLE "price_kg_types" ALTER COLUMN "species" SET DEFAULT 'PERRO'::"Species";

ALTER TABLE "price_kg_brands" ALTER COLUMN "species" DROP DEFAULT;
ALTER TABLE "price_kg_brands" ALTER COLUMN "species" TYPE "Species" USING "species"::"Species";
ALTER TABLE "price_kg_brands" ALTER COLUMN "species" SET DEFAULT 'PERRO'::"Species";

-- Down (reversible: sin datos críticos)
-- ALTER TABLE "price_kg_brands" ALTER COLUMN "species" DROP DEFAULT;
-- ALTER TABLE "price_kg_brands" ALTER COLUMN "species" TYPE TEXT USING "species"::TEXT;
-- ALTER TABLE "price_kg_brands" ALTER COLUMN "species" SET DEFAULT 'PERRO';
-- ALTER TABLE "price_kg_types" ALTER COLUMN "species" DROP DEFAULT;
-- ALTER TABLE "price_kg_types" ALTER COLUMN "species" TYPE TEXT USING "species"::TEXT;
-- ALTER TABLE "price_kg_types" ALTER COLUMN "species" SET DEFAULT 'PERRO';
-- DROP TYPE "Species";