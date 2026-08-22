-- Datos fiscales del emisor para la factura estándar ARCA (Ingresos Brutos e
-- Inicio de Actividades se muestran debajo del CUIT en el comprobante, al
-- estilo del modelo de referencia).
--
-- PARTE ADITIVA, sin data migration. Los dos campos son TEXT nullable y se
-- guardan tal cual los captura el form (ej. "20-12345678-3" y "01/01/2000"),
-- sin parsing de fecha para evitar líos de zona horaria.
--
-- Reversible: ALTER TABLE ... DROP COLUMN.
-- Backwards compatible: el build anterior sigue leyendo/escribiendo sin
-- cambios (columnas nuevas nullable).
--
-- Generada OFFLINE (no hay DB local, CLAUDE.md): se aplica en el VPS con
-- `prisma migrate deploy` (deploy.sh paso 6).

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "ingresosBrutos" TEXT,
ADD COLUMN     "inicioActividades" TEXT;
