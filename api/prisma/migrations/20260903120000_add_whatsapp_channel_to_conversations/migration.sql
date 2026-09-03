-- Canal de origen de las conversaciones (WEB = widget tienda, WHATSAPP = Kapso).
-- Default 'WEB' para que las filas existentes mantengan su comportamiento.
CREATE TYPE "ConversationChannel" AS ENUM ('WEB', 'WHATSAPP');

ALTER TABLE "conversations" ADD COLUMN "channel" "ConversationChannel" NOT NULL DEFAULT 'WEB';

-- Identidad del cliente por WhatsApp (E.164 sin espacios/+). Null en canal WEB.
ALTER TABLE "conversations" ADD COLUMN "guestPhone" TEXT;

CREATE INDEX "conversations_organizationId_channel_guestPhone_idx" ON "conversations"("organizationId", "channel", "guestPhone");
