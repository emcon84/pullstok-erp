-- Add "carried" (¿lo trabaja el negocio?) to products.
-- Default true: todo el catálogo existente queda visible/operativo; el admin
-- marca/desmarca y el filtro "solo lo que trabajo" oculta los desmarcados.

ALTER TABLE "products" ADD COLUMN "carried" BOOLEAN NOT NULL DEFAULT true;
