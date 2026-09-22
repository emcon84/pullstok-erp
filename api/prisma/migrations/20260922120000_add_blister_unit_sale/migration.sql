-- ═══════════════════════════════════════════════════════════════════════════
-- sdd/venta-pastillas-sueltas-blister — venta de pastillas sueltas de un
-- blister (FARMACIA)
-- ═══════════════════════════════════════════════════════════════════════════
-- Record-only, ADITIVA, SIN data migration:
--   1) Enum `SaleMode` + valor `POR_UNIDAD_BLISTER`: línea de venta de un
--      blister cuyo conteo de pastillas es AD-HOC (cargado por el vendedor al
--      momento de la venta), a diferencia de POR_UNIDAD que usa el
--      `unitsPerBox` persistido en Product. Aditivo → filas legacy no migran.
--   2) `sale_items.piecesPerBlister` (INTEGER nullable): auditoría — cuántas
--      pastillas tenía ESE blister en ESA venta. Solo se popula en renglones
--      POR_UNIDAD_BLISTER.
--
-- ⚠️ ROLLBACK (no reversible en una sola migración): ALTER TYPE ... ADD VALUE
-- no se puede quitar con DROP VALUE en una migración Prisma; rollback =
-- restore del pg_dump + redeploy del build anterior (mismo criterio que
-- 20260831000000_multipack_units_per_box).
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterEnum (aditivo: el nuevo valor no rompe filas legacy)
ALTER TYPE "SaleMode" ADD VALUE 'POR_UNIDAD_BLISTER';

-- AlterTable (aditiva, nullable, sin data migration)
ALTER TABLE "sale_items" ADD COLUMN "piecesPerBlister" INTEGER;

-- ═══════════════════════════════════════════════════════════════════════════
-- DOWN (reversión vía pg_dump restore — ADD VALUE no es drop-able en Prisma)
-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE "sale_items" DROP COLUMN "piecesPerBlister";
-- -- El valor 'POR_UNIDAD_BLISTER' del enum NO se quita con DROP VALUE
-- -- (Postgres < 12); rollback completo = pg_dump del estado previo + redeploy
-- -- del build.
