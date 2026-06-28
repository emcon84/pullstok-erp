-- AlterTable: add nullable saleId to invoices (Sale→Invoice bridge)
-- NULL is allowed on @unique in Postgres, so service invoices (no saleId) don't collide.
ALTER TABLE "invoices" ADD COLUMN "saleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_saleId_key" ON "invoices"("saleId");

-- AddForeignKey
-- onDelete: SetNull (Prisma default for optional FK) — deleting a Sale nullifies the link
-- but does NOT cascade-delete the invoice (it is a historical snapshot).
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
