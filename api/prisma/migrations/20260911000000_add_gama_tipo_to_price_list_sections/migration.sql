-- GAMA/TIPO reales del proveedor por sección de planilla (jerarquía del PDF
-- multi-marca). Ej. gama "Feline Veterinary Health Nutrition", tipo "Urinary
-- Húmedo". Permite agrupar el print por la jerarquía real del proveedor en vez
-- de la línea inferida del nombre (que fragmentaba en "VETERINARY FELINE").
--
-- Generada OFFLINE (no hay DB local, CLAUDE.md): se aplica en el VPS con
-- `prisma migrate deploy`. Reversible: ALTER TABLE ... DROP COLUMN.

-- AlterTable
ALTER TABLE "price_list_sections" ADD COLUMN "gama" TEXT;
ALTER TABLE "price_list_sections" ADD COLUMN "tipo" TEXT;
