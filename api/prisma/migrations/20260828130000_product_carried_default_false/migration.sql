-- "carried" (¿lo trabaja el negocio?) pasa a default FALSE: el check es un
-- marcador extra que crece a medida que el admin marca. El catálogo completo
-- NO se borra; el filtro "solo lo que trabajo" (administrativo, no automático)
-- es el único que acota la búsqueda a los marcados cuando se enciende.
--
-- 1) Cambiar el default del campo para productos nuevos (arrancan "no marcado").
-- 2) Poner TODOS los productos existentes en carried=false: el admin va
--    marcando incrementalmente los que trabaja (nada se pierde de la lista).

ALTER TABLE "products" ALTER COLUMN "carried" SET DEFAULT false;
UPDATE "products" SET "carried" = false;
