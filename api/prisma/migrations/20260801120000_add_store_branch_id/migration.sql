-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN "storeBranchId" TEXT;

-- AddForeignKey
-- onDelete SET NULL (decisión D6 del design): si se borra la sucursal, la
-- tienda cae sola al fallback de casa central sin dejar estado inválido.
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_storeBranchId_fkey" FOREIGN KEY ("storeBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTA: esta migración NO toca el índice único parcial "branch_single_headquarters"
-- de la migración 20260731191410_add_product_stock_and_headquarters. Prisma no
-- conoce ese índice (se agregó a mano) y NO debe regenerarse ni dropearse.
-- ═══════════════════════════════════════════════════════════════════════════
