-- Precio mayorista por producto + flag de vendedor mayorista (feature
-- "precio mayorista para usuario interno").
--
-- products.wholesalePrice: Decimal nullable, distinto de suggestedPrice (que
-- es el precio sugerido del proveedor al importar una planilla). null =
-- producto sin precio mayorista propio → fallback a price. Reversible:
-- ALTER TABLE ... DROP COLUMN. Backwards compatible: columna nueva nullable.
--
-- users.sellsWholesale: Boolean default false, independiente de Role. Un
-- usuario con sellsWholesale=true vende siempre a wholesalePrice cuando el
-- producto lo tiene configurado.
--
-- Generada OFFLINE (no hay DB local, CLAUDE.md): se aplica en el VPS con
-- `prisma migrate deploy` (deploy.sh paso 6).

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "wholesalePrice" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sellsWholesale" BOOLEAN NOT NULL DEFAULT false;
