-- Clientes y proveedores con datos administrativos (import desde GFLOW)
-- Todas las columnas nuevas son opcionales o tienen default: seguro sobre filas
-- existentes. Los índices únicos (organizationId, code) permiten varios NULL.

-- Customer
ALTER TABLE "customers" ADD COLUMN "code" TEXT;
ALTER TABLE "customers" ADD COLUMN "locality" TEXT;
ALTER TABLE "customers" ADD COLUMN "province" TEXT;
ALTER TABLE "customers" ADD COLUMN "zone" TEXT;
ALTER TABLE "customers" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX "customers_organizationId_code_key" ON "customers"("organizationId", "code");

-- Provider
ALTER TABLE "providers" ADD COLUMN "code" TEXT;
ALTER TABLE "providers" ADD COLUMN "taxId" TEXT;
ALTER TABLE "providers" ADD COLUMN "taxCondition" TEXT;
ALTER TABLE "providers" ADD COLUMN "address" TEXT;
ALTER TABLE "providers" ADD COLUMN "locality" TEXT;
ALTER TABLE "providers" ADD COLUMN "province" TEXT;
ALTER TABLE "providers" ADD COLUMN "phone" TEXT;
ALTER TABLE "providers" ADD COLUMN "email" TEXT;
ALTER TABLE "providers" ADD COLUMN "classification" TEXT;
ALTER TABLE "providers" ADD COLUMN "accountingRef" TEXT;
ALTER TABLE "providers" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "providers" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "providers_organizationId_code_key" ON "providers"("organizationId", "code");
