-- ═══════════════════════════════════════════════════════════════════════════
-- Descuento porcentual a nivel venta (sdd/venta-descuento)
-- ═══════════════════════════════════════════════════════════════════════════
-- Agrega el monto en $ del descuento aplicado a la venta. El vendedor ingresa
-- un % (discountPct del request) y el server materializa acá el monto:
--   discount = round2(subtotal * pct / 100)
--   totalAmount = subtotal - discount   (el monto FINAL, ya descontado)
-- Backward-compat: DEFAULT 0 → las ventas existentes (y las nuevas sin
-- descuento) no cambian de comportamiento.

ALTER TABLE "sales" ADD COLUMN "discount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- DOWN (reversión)
-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE "sales" DROP COLUMN "discount";
