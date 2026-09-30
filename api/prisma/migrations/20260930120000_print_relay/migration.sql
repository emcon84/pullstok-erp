-- ═══════════════════════════════════════════════════════════════════════════
-- Impresión desde el celular (print-from-mobile): agentes, impresoras y jobs
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Enum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'PRINTED', 'ERROR', 'EXPIRED', 'CANCELLED');

-- 2. Tabla print_agents
CREATE TABLE "print_agents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT,
    "pairingCodeHash" TEXT,
    "pairingExpiresAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "localPrinters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "print_agents_pkey" PRIMARY KEY ("id")
);

-- 3. Tabla printers
CREATE TABLE "printers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT,
    "agentId" TEXT,
    "localName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- 4. Tabla print_jobs
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "branchId" TEXT,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" BYTEA NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE UNIQUE INDEX "print_agents_pairingCodeHash_key" ON "print_agents"("pairingCodeHash");
CREATE INDEX "print_agents_organizationId_idx" ON "print_agents"("organizationId");
CREATE UNIQUE INDEX "printers_organizationId_name_key" ON "printers"("organizationId", "name");
CREATE INDEX "printers_agentId_idx" ON "printers"("agentId");
CREATE INDEX "print_jobs_organizationId_status_idx" ON "print_jobs"("organizationId", "status");
CREATE INDEX "print_jobs_printerId_status_idx" ON "print_jobs"("printerId", "status");

-- FKs
ALTER TABLE "print_agents" ADD CONSTRAINT "print_agents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "printers" ADD CONSTRAINT "printers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "printers" ADD CONSTRAINT "printers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "printers" ADD CONSTRAINT "printers_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "print_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- DOWN (reversión)
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP TABLE "print_jobs";
-- DROP TABLE "printers";
-- DROP TABLE "print_agents";
-- DROP TYPE "PrintJobStatus";
