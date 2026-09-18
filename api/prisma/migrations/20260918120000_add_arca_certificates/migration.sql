-- Certificados ARCA self-service por organización
-- (sdd/arca-certificados-self-service, task T1).
--
-- ArcaCertificate: 1 fila por (organizationId, environment) — hasta 2 filas
-- por org (HOMOLOGACION + PRODUCCION). Clave privada NUNCA en claro:
-- keyCiphertext/keyIv/keyAuthTag son AES-256-GCM (ver
-- api/src/utils/certEncryption.ts). certPem es público, se guarda en claro.
--
-- ArcaSetting.certPath/keyPath quedan @deprecated (no se borran: evita
-- migración destructiva en el primer rollout; el backfill T5 puebla
-- ArcaCertificate desde esas rutas para las orgs con certs ya en el VPS).
--
-- Generada OFFLINE (no hay DB local, CLAUDE.md): se aplica en el VPS con
-- `prisma migrate deploy` (deploy.sh paso 6).

-- CreateTable
CREATE TABLE "arca_certificates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" "ArcaEnvironment" NOT NULL,
    "certPem" TEXT NOT NULL,
    "keyCiphertext" BYTEA NOT NULL,
    "keyIv" BYTEA NOT NULL,
    "keyAuthTag" BYTEA NOT NULL,
    "subjectCn" TEXT,
    "subjectCuit" TEXT,
    "issuer" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arca_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arca_certificates_organizationId_environment_key" ON "arca_certificates"("organizationId", "environment");

-- AddForeignKey
ALTER TABLE "arca_certificates" ADD CONSTRAINT "arca_certificates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
