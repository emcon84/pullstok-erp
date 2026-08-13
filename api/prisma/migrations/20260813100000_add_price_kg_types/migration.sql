-- Tipos de "Precios por kilo" (etapas de vida del alimento). Los nombres de
-- columna DEBEN coincidir con los campos del cliente Prisma (convención
-- camelCase, ej. organizationId). `synonyms` es un array nativo TEXT[] de
-- Postgres (Prisma 7 String[]), con default array vacío.

-- CreateTable
CREATE TABLE "price_kg_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "synonyms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_kg_types_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "price_kg_types" ADD CONSTRAINT "price_kg_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
-- Unicidad case-insensitive por (org, name): mismo patrón que providers — la
-- @@unique([organizationId, name]) del schema.prisma se materializa acá como
-- índice funcional LOWER para evitar "Adulto" y "adulto" duplicados a nivel DB
-- (misma desviación intencional que providers/price_lists).
CREATE UNIQUE INDEX "price_kg_types_organizationId_name_key" ON "price_kg_types"("organizationId", LOWER("name"));

CREATE INDEX "price_kg_types_organizationId_idx" ON "price_kg_types"("organizationId");

-- Down (reversible: sin datos críticos)
-- DROP TABLE "price_kg_types";
