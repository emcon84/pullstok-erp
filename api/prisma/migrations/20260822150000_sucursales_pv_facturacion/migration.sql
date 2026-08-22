-- ═══════════════════════════════════════════════════════════════════════════
-- sdd/sucursales-pv-facturacion — PV de ARCA por sucursal
-- Migración ADITIVA (offline, sin DB local). Columnas nullable + valores null
-- → fallback a casa central / PV global de ArcaSetting (sin backfill).
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable: punto de venta fiscal de la sucursal (opcional).
ALTER TABLE "branches" ADD COLUMN "puntoVenta" INTEGER;

-- AlterTable: sucursal emisora de la factura (opcional, legacy null => org-wide).
ALTER TABLE "invoices" ADD COLUMN "branchId" TEXT;

-- CreateIndex: índice para el join Invoice.branch (mismo patrón que Prisma genera
-- para una relación @relation de una cancha).
CREATE INDEX "invoices_branchId_idx" ON "invoices"("branchId");

-- AddForeignKey: onDelete SET NULL — borrar una sucursal NO borra su histórico
-- de facturas, solo las deja sin sucursal (caen al fallback). Mismo criterio
-- que products.categoryId / StoreSettings.storeBranchId.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- ÍNDICE ÚNICO PARCIAL — PV activo por organización (NO expresable en Prisma)
-- ═══════════════════════════════════════════════════════════════════════════
-- Garantiza que a lo sumo UNA sucursal ACTIVA por org usa el mismo punto de
-- venta. El resto de la validación (409 con field error) es app-level en
-- branchController (R7); este índice es el hardening anti-race, el MISMO
-- patrón que "branch_single_headquarters" y "cash_session_single_open".
--
-- ⚠️  IMPORTANTE: NO EDITAR NI REGENERAR. Prisma NO puede expresar índices
-- parciales en schema.prisma, así que este CREATE UNIQUE INDEX se agregó a
-- mano y `prisma migrate dev` NO lo conoce. Si regenerás migraciones desde el
-- schema, Prisma no lo va a dropear ni recrear (no aparece en el diff), pero
-- tampoco lo va a crear de nuevo: si borrás esta línea, la garantía de "un
-- solo PV activo por org" se pierde. Mantenelo tal cual, con este MISMO nombre.
CREATE UNIQUE INDEX "branch_active_puntoVenta" ON "branches"("organizationId", "puntoVenta") WHERE "isActive" = true AND "puntoVenta" IS NOT NULL;
