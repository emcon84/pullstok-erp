import { Request, Response } from "express";
import {
  verifyWebhookSignature,
  handleIncomingMessage,
} from "../services/whatsappService";

/**
 * Webhook entrante de WhatsApp vía Kapso (FASE 1). Público: Kapso pega acá con
 * la firma HMAC del body crudo (x-webhook-signature). SIEMPRE respondemos 200
 * (el provider espera ack < 10s) — el trabajo va en try/catch para que un
 * payload aislado no corte el ack del lote.
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers["x-webhook-signature"] as string | undefined;
  const event = req.headers["x-webhook-event"] as string | undefined;

  // Eventos que no son el message.received (p.ej. delivery/read receipts) son
  // no-op en FASE 1: se ackean de una. Un lote (batch) de received sí llega acá
  // con el header "whatsapp.message.received" → no se ack-ea temprano.
  if (event && event !== "whatsapp.message.received") {
    res.status(200).send("OK");
    return;
  }

  const rawBody = (req as any).rawBody as Buffer | undefined;
  const ok = verifyWebhookSignature(
    rawBody ?? Buffer.alloc(0),
    signature,
    process.env.KAPSO_WEBHOOK_SECRET ?? "",
  );
  if (!ok) {
    res.status(401).json({ message: "Invalid signature" });
    return;
  }

  let data: any;
  try {
    data = JSON.parse((rawBody ?? Buffer.alloc(0)).toString("utf8"));
  } catch {
    res.status(400).json({ message: "Invalid JSON body" });
    return;
  }

  // Soporte lote: signal de "lote de mensajes" viene dentro del body.
  const payloads =
    data.batch === true && Array.isArray(data.data) ? data.data : [data];

  for (const payload of payloads) {
    try {
      await handleIncomingMessage(payload);
    } catch (err) {
      // Un payload con error no corta el ack del resto del lote.
      console.error("[whatsapp] fallo procesando un payload del webhook", err);
    }
  }

  res.status(200).send("OK");
};

export default { handleWebhook };
