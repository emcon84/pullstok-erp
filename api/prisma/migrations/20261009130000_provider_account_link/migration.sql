-- AlterTable
ALTER TABLE "providers" ADD COLUMN     "accountId" TEXT;

-- CreateIndex
CREATE INDEX "providers_accountId_idx" ON "providers"("accountId");

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: vincula los proveedores existentes con la cuenta imputable cuyo
-- código corto coincide con el primer token de la referencia contable legada
-- (ej. "2001 Proveedores Varios" -> cuenta con shortCode "2001"), por organización.
UPDATE "providers" p
SET "accountId" = a."id"
FROM "accounts" a
WHERE p."accountId" IS NULL
  AND p."accountingRef" IS NOT NULL
  AND a."organizationId" = p."organizationId"
  AND a."isPostable" = true
  AND a."shortCode" = split_part(btrim(p."accountingRef"), ' ', 1);
