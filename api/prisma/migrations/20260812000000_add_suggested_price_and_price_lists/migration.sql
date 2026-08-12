-- AlterTable: precio mayorista sugerido (sin backfill — no-goal del slice)
ALTER TABLE "products" ADD COLUMN "suggested_price" DECIMAL(12,2);

-- CreateEnum
CREATE TYPE "PriceListType" AS ENUM ('SECO', 'WET');

-- CreateTable
CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ALICAN',
    "type" "PriceListType" NOT NULL,
    "period" TEXT,
    "source_filename" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_list_sections" (
    "id" TEXT NOT NULL,
    "price_list_id" TEXT NOT NULL,
    "brand" TEXT,
    "line" TEXT,
    "subline" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "price_list_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_list_entries" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "product_id" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "price_sin_iva" DECIMAL(12,2),
    "price_con_iva" DECIMAL(12,2),
    "suggested_price" DECIMAL(12,2),
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "price_list_entries_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "price_list_sections" ADD CONSTRAINT "price_list_sections_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "price_list_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
-- Idempotencia (design D2): índice único PARCIAL — una planilla por
-- (org, type, period) cuando period NO es null. Los period null (PDF sin
-- vigencia) NO bloquean creaciones nuevas (Postgres trata NULLs como
-- distintos). Prisma no declara índices parciales en el schema DSL: el
-- @@unique([organizationId, type, period]) del schema se materializa acá
-- como índice parcial (equivalente funcional; la revisión con
-- `prisma migrate diff` mostrará esta diferencia intencional).
CREATE UNIQUE INDEX "price_lists_organization_id_type_period_key" ON "price_lists"("organization_id", "type", "period") WHERE "period" IS NOT NULL;

CREATE INDEX "price_lists_organization_id_imported_at_idx" ON "price_lists"("organization_id", "imported_at");

CREATE INDEX "price_list_sections_price_list_id_position_idx" ON "price_list_sections"("price_list_id", "position");

CREATE INDEX "price_list_entries_section_id_position_idx" ON "price_list_entries"("section_id", "position");

-- Down (reversible: DROP tablas + columna + enum; sin datos críticos)
-- DROP TABLE "price_list_entries";
-- DROP TABLE "price_list_sections";
-- DROP TABLE "price_lists";
-- DROP TYPE "PriceListType";
-- ALTER TABLE "products" DROP COLUMN "suggested_price";
