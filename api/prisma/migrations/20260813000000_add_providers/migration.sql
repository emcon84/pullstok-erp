-- Proveedores de la organización (sdd/alican-wholesale-price-list/providers).
-- Los nombres de columna DEBEN coincidir con los campos del cliente Prisma
-- (convención camelCase — ej. providers.organizationId, products.providerId).

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- AlterTable: asociación opcional producto → proveedor (null = sin proveedor).
ALTER TABLE "products" ADD COLUMN "providerId" TEXT;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- onDelete SET NULL para products.providerId: borrar un proveedor NO borra los
-- productos (solo les deja el providerId null). Mismo criterio que la FK de
-- products.categoryId (relación opcional sin onDelete explícito → SetNull).
ALTER TABLE "products" ADD CONSTRAINT "products_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
-- Unicidad case-insensitive por (org, name): el código resuelve por nombre con
-- findFirst { mode: "insensitive" } y crea si no existe (nunca findUnique — la
-- extensión multi-tenant de db.ts lo bloquea). El índice funcional LOWER evita
-- "Alican" y "alican" duplicados a nivel DB. La @@unique([organizationId, name])
-- del schema.prisma se materializa acá como índice funcional (misma desviación
-- intencional que el índice parcial de price_lists; `prisma migrate diff`
-- mostrará esta diferencia).
CREATE UNIQUE INDEX "providers_organizationId_name_key" ON "providers"("organizationId", LOWER("name"));

CREATE INDEX "providers_organizationId_idx" ON "providers"("organizationId");

-- Índice compuesto para el filtro por proveedor en bulk-price-update
-- (providerId IN (...) combinado con brand/categoría).
CREATE INDEX "products_organizationId_providerId_idx" ON "products"("organizationId", "providerId");

-- Down (reversible: sin datos críticos)
-- DROP TABLE "providers";
-- ALTER TABLE "products" DROP COLUMN "providerId";
