-- Planillas guardadas por el usuario (saved planillas). Snapshot inmutable de
-- la planilla mayorista o de la vista previa de actualización de precios para
-- reabrir/imprimir desde otro dispositivo. `type`: "MAYORISTA" |
-- "ACTUALIZACION"; `rows` es el snapshot JSON de las filas.
--
-- Generada OFFLINE (no hay DB local, CLAUDE.md): se aplica en el VPS con
-- `prisma migrate deploy`. Reversible: DROP TABLE "saved_planillas".

-- CreateTable
CREATE TABLE "saved_planillas" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "rows" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "saved_planillas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_planillas_organizationId_createdAt_idx" ON "saved_planillas"("organizationId", "createdAt");
