-- sdd/arca-facturacion-electronica — facturación electrónica ARCA (WSFEv1).
--
-- PARTE ADITIVA + relajación nullable, sin data migration:
--   1) Enums: +PENDING_CAE en InvoiceStatus, nuevo ArcaEnvironment.
--   2) Tablas nuevas: arca_settings (1:1 org, fuera de TENANT_MODELS) y
--      arca_sequences (cache del correlativo reservado por org/PV/tipoCbte).
--   3) invoices: campos fiscales nullable (cbteNro, docTipoReceptor,
--      docNroReceptor, condicionIvaReceptorId, arcaErrorCode/Message,
--      arcaAttempts) + customerId pasa a OPCIONAL (Factura B de mostrador
--      DocTipo 99 / DocNro 0, sin Customer asociado). La FK se recrea con
--      ON DELETE SET NULL (mismo criterio que loosePriceId).
--
-- Reversible: tablas/columnas nuevas + columnas nullable + valor de enum.
-- Rollback = DROP de lo nuevo + ADD VALUE no removible (el valor PENDING_CAE
-- queda en el enum; el código viejo no lo usa). Backwards compatible: con
-- esto presente el build anterior sigue leyendo/escribiendo sin cambios.
--
-- Generada OFFLINE con `prisma migrate diff` (--from-schema HEAD vs
-- --to-schema local), porque no hay DB local (CLAUDE.md). El deploy la
-- aplica el VPS con `prisma migrate deploy` (deploy.sh paso 6).

-- CreateEnum
CREATE TYPE "ArcaEnvironment" AS ENUM ('HOMOLOGACION', 'PRODUCCION');

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'PENDING_CAE';

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_customerId_fkey";

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "arcaAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "arcaErrorCode" TEXT,
ADD COLUMN     "arcaErrorMessage" TEXT,
ADD COLUMN     "cbteNro" INTEGER,
ADD COLUMN     "condicionIvaReceptorId" INTEGER,
ADD COLUMN     "docNroReceptor" TEXT,
ADD COLUMN     "docTipoReceptor" INTEGER,
ALTER COLUMN "customerId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "arca_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cuitEmisor" TEXT NOT NULL,
    "puntoVenta" INTEGER NOT NULL,
    "environment" "ArcaEnvironment" NOT NULL DEFAULT 'HOMOLOGACION',
    "certPath" TEXT NOT NULL,
    "keyPath" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arca_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arca_sequences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "puntoVenta" INTEGER NOT NULL,
    "tipoCbte" TEXT NOT NULL,
    "lastReserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arca_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arca_settings_organizationId_key" ON "arca_settings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "arca_sequences_organizationId_puntoVenta_tipoCbte_key" ON "arca_sequences"("organizationId", "puntoVenta", "tipoCbte");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_settings" ADD CONSTRAINT "arca_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_sequences" ADD CONSTRAINT "arca_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;