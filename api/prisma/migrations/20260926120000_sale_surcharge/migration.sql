-- ═══════════════════════════════════════════════════════════════════════════
-- Recargo por tarjeta de crédito a nivel venta (recargo-tarjeta-credito)
-- ═══════════════════════════════════════════════════════════════════════════
-- Agrega el monto en $ del recargo aplicado a la venta. El vendedor ingresa un
-- % (surchargePct del request) que se aplica SOLO sobre lo pagado con
-- TARJETA_CREDITO; el server materializa acá el monto:
--   surcharge = Σ por fila de tarjeta round2(base * pct / 100)
--   totalAmount = subtotal - discount + surcharge   (el monto FINAL cobrado)
-- Backward-compat: DEFAULT 0 → las ventas existentes (y las nuevas sin
-- recargo) no cambian de comportamiento.

ALTER TABLE "sales" ADD COLUMN "surcharge" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- DOWN (reversión)
-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE "sales" DROP COLUMN "surcharge";
