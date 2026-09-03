-- Nodo actual del flujo guiado de WhatsApp (FASE 2). Null = fuera del flujo.
-- Se guarda como string para no migrar por cada nodo nuevo.
ALTER TABLE "conversations" ADD COLUMN "whatsappStage" TEXT;
