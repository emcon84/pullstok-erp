-- AlterTable: precio mayorista sugerido (sin backfill — no-goal del slice).
-- Los nombres de columna DEBEN coincidir con los campos del cliente Prisma
-- (convención camelCase — ej. products.organizationId). La versión previa usaba
-- snake_case y TODO read/write lanzaba P2022 (fix round 2, verify obs #213).
ALTER TABLE "products" ADD COLUMN "suggestedPrice" DECIMAL(12,2);

-- CreateEnum
CREATE TYPE "PriceListType" AS ENUM ('SECO', 'WET');

-- CreateTable
CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ALICAN',
    "type" "PriceListType" NOT NULL,
    "period" TEXT,
    "sourceFilename" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_list_sections" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "brand" TEXT,
    "line" TEXT,
    "subline" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "price_list_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_list_entries" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "priceSinIva" DECIMAL(12,2),
    "priceConIva" DECIMAL(12,2),
    "suggestedPrice" DECIMAL(12,2),
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "price_list_entries_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "price_list_sections" ADD CONSTRAINT "price_list_sections_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "price_list_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
-- Idempotencia (design D2): índice único PARCIAL — una planilla por
-- (org, type, period) cuando period NO es null. Los period null (PDF sin
-- vigencia) NO bloquean creaciones nuevas (Postgres trata NULLs como
-- distintos). Prisma no declara índices parciales en el schema DSL: el
-- @@unique([organizationId, type, period]) del schema se materializa acá
-- como índice parcial (equivalente funcional; la revisión con
-- `prisma migrate diff` mostrará esta diferencia intencional).
CREATE UNIQUE INDEX "price_lists_organizationId_type_period_key" ON "price_lists"("organizationId", "type", "period") WHERE "period" IS NOT NULL;

CREATE INDEX "price_lists_organizationId_importedAt_idx" ON "price_lists"("organizationId", "importedAt");

CREATE INDEX "price_list_sections_priceListId_position_idx" ON "price_list_sections"("priceListId", "position");

CREATE INDEX "price_list_entries_sectionId_position_idx" ON "price_list_entries"("sectionId", "position");

-- Down (reversible: DROP tablas + columna + enum; sin datos críticos)
-- DROP TABLE "price_list_entries";
-- DROP TABLE "price_list_sections";
-- DROP TABLE "price_lists";
-- DROP TYPE "PriceListType";
-- ALTER TABLE "products" DROP COLUMN "suggestedPrice";
