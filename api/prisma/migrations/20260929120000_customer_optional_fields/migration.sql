-- Clientes sin campos obligatorios (customer-account-historical)
-- name y email pasan a ser opcionales. El índice único (organizationId, email)
-- se mantiene: en Postgres varios NULL no colisionan.
ALTER TABLE "customers" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "email" DROP NOT NULL;
