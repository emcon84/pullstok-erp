-- ═══════════════════════════════════════════════════════════════════════════
-- sdd/venta-por-unidad-multpack — multi-pack por UNIDAD
-- ═══════════════════════════════════════════════════════════════════════════
-- Record-only, ADITIVA, SIN data migration:
--   1) `products.unitsPerBox` (INTEGER nullable): cuántas unidades vienen por
--      caja/pack. null = producto NO multi-pack (box-only, comportamiento
--      legacy). Un producto es vendible "por unidad" SOLO cuando
--      unitsPerBox > 1 y no null.
--   2) Enum `SaleMode` + valor `POR_UNIDAD`: marca una línea de venta de un
--      multi-pack vendido por unidad. Aditivo → las filas legacy siguen
--      BOLSA_CERRADA sin migrar.
--
-- El backfill (parse de unitsPerBox desde el nombre + stock a unidades + recompute
-- de Product.quantity) es un job OPERATIVO que corre en el VPS:
--   api/prisma/scripts/backfill-unitsPerBox.ts  (dry-run → confirm → apply)
--   api/prisma/scripts/rollback-unitsPerBox.ts  (rollback)
-- NO va acá: es idempotente y gated por humano (ver tasks 3.1-3.3).
--
-- ⚠️ ROLLBACK (no reversible en una sola migración): ALTER TYPE ... ADD VALUE
-- no se puede quitar con DROP VALUE en una migración Prisma; rollback = restore
-- del pg_dump + redeploy del build anterior (single release, sin partial
-- rollback — mismo criterio que la migración 20260810000000_loose_sale).
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterEnum (aditivo: el nuevo valor no rompe filas legacy)
ALTER TYPE "SaleMode" ADD VALUE 'POR_UNIDAD';

-- AlterTable (aditiva, nullable, sin data migration)
ALTER TABLE "products" ADD COLUMN "unitsPerBox" INTEGER;

-- ═══════════════════════════════════════════════════════════════════════════
-- DOWN (reversión vía pg_dump restore — ADD VALUE no es drop-able en Prisma)
-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE "products" DROP COLUMN "unitsPerBox";
-- -- El valor 'POR_UNIDAD' del enum NO se quita con DROP VALUE (Postgres < 12);
-- -- rollback completo = pg_dump del estado previo + redeploy del build.
