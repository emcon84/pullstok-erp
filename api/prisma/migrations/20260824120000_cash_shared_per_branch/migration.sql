-- ═══════════════════════════════════════════════════════════════════════════
-- Caja compartida por sucursal: una sola OPEN por branch (no por branch+cashier)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cambia la garantía de "una sola caja OPEN por (branchId, cashierId)" a "una
-- sola caja OPEN por branchId". La caja pasa a ser compartida: cualquier
-- persona con acceso a la sucursal vende y ve el detalle en vivo, y quien la
-- abrió (cashierId) queda como auditoría pero ya no limita quién puede operar.
--
-- ⚠️  IMPORTANTE: NO EDITAR NI REGENERAR este índice en futuras migraciones.
-- Prisma NO puede expresar índices parciales en schema.prisma, así que este
-- CREATE UNIQUE INDEX se agregó a mano (mismo patrón que
-- `branch_single_headquarters` y el índice original de 20260820120000_cash_sessions)
-- y `prisma migrate dev` NO lo conoce. Mantenelo tal cual, con este MISMO nombre.

DROP INDEX IF EXISTS "cash_session_single_open";
CREATE UNIQUE INDEX "cash_session_single_open" ON "cash_sessions"("branchId") WHERE "status" = 'OPEN';

-- ═══════════════════════════════════════════════════════════════════════════
-- DOWN (reversión)
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP INDEX "cash_session_single_open";
-- CREATE UNIQUE INDEX "cash_session_single_open" ON "cash_sessions"("branchId", "cashierId") WHERE "status" = 'OPEN';
