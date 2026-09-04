-- FASE 6 del bot de WhatsApp (Kapso): multi-producto + observación en el borrador.
--
-- `items`: array JSON de líneas del pedido que el bot capturó (una por producto
-- confirmado). Cada línea guarda productId/productName (si hubo match con el
-- catálogo), type, quantity, amount, detail, total, marca, especie, etapa, peso
-- y observacion. Si no hubo match, productId/productName quedan null y el ítem
-- es un "requerimiento" que el operador arma en el ERP.
--
-- `notes`: observación libre del pedido (lo que el cliente respondió en el nodo
-- de observación). Null si respondió "no" / dejó vacío.

ALTER TABLE "whatsapp_order_drafts" ADD COLUMN "items" JSONB;
ALTER TABLE "whatsapp_order_drafts" ADD COLUMN "notes" TEXT;
