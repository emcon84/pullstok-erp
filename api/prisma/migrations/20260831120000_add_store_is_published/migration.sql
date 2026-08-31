-- AlterTable
-- Tienda online publicada (switch del admin): false = borrador, la tienda
-- pública no sirve catálogo, detalle ni checkout (403 STORE_NOT_PUBLISHED).
ALTER TABLE "store_settings" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;
