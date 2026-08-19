-- sdd/arca-padron-a4 — CUIT con autorización del padrón A4 para autocompletar
-- clientes. El padrón se consulta con el CUIT que habilitó ws_sr_padron_a4
-- (persona física), que puede diferir del cuitEmisor de facturación.
--
-- PARTE ADITIVA (columna nullable): el build anterior sigue funcionando sin
-- cambios (el código viejo no lee/escribe padronCuit). Reversible = DROP COLUMN.
--
-- Generada OFFLINE con `prisma migrate diff` (no hay DB local, CLAUDE.md). El
-- deploy la aplica el VPS con `prisma migrate deploy` (deploy.sh paso 6).

-- AlterTable
ALTER TABLE "arca_settings" ADD COLUMN     "padronCuit" TEXT;
