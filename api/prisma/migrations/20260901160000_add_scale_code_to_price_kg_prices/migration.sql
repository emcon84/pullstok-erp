-- Pivot del código de balanza al destino correcto: la CELDA de la planilla
-- (PriceKgPrice), no el Product. Los "productos sueltos" son las celdas
-- Marca × Tipo × Especie que el negocio define en "Precios por kilo".

-- Product.scaleCode nunca se pobló (asignaba 0) y apuntaba al ente equivocado.
DROP INDEX IF EXISTS "products_organizationId_scaleCode_idx";
ALTER TABLE "products" DROP COLUMN IF EXISTS "scaleCode";

-- Código de balanza de la celda (llave <=> etiqueta EAN-13 20 + scaleCode + peso).
ALTER TABLE "price_kg_prices" ADD COLUMN "scaleCode" TEXT;

-- CreateIndex
CREATE INDEX "price_kg_prices_organizationId_scaleCode_idx" ON "price_kg_prices"("organizationId", "scaleCode");
