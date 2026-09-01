-- AlterTable
-- Código interno de balanza (PLU Systel Cuora) en products. Es la llave que une
-- la etiqueta de la balanza (EAN-13 = 20 + scaleCode + peso + verificador) con
-- el producto: el POS lo usa para resolver el producto al escanear.
ALTER TABLE "products" ADD COLUMN "scaleCode" TEXT;

-- CreateIndex
CREATE INDEX "products_organizationId_scaleCode_idx" ON "products"("organizationId", "scaleCode");
