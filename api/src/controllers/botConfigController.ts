import { Response } from "express";
import { BotConfig } from "@prisma/client";
import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { AuthedRequest } from "../middlewares/authMiddleware";

// Config del bot IA del comercio (1:1 con Organization). BotConfig ESTÁ en
// TENANT_MODELS (db.ts) → el cliente `prisma` scopeado inyecta el organizationId
// automáticamente. OJO: en modelos tenant la extensión BLOQUEA findUnique/upsert
// → se usa findFirst (lectura scopeada) + updateMany/create (escritura scopeada).
// El gate PREMIUM lo aplica checkBotEnabled en el router, antes de llegar acá.

// Defaults espejo del schema.prisma (model BotConfig). Se devuelven cuando la org
// todavía no tiene fila, sin crear nada (create-on-read se evita: la fila nace
// recién en el primer PUT).
const DEFAULTS = {
  enabled: false,
  knowledgeBase: "",
  model: "llama-3.1-8b-instant",
  dailyLimit: 200,
};

// DTO público: NUNCA se expone apiKey (columna sensible, placeholder BYO-key).
const toDTO = (config: BotConfig) => ({
  enabled: config.enabled,
  knowledgeBase: config.knowledgeBase,
  model: config.model,
  dailyLimit: config.dailyLimit,
});

/** GET /api/bot/config — devuelve la config del bot de SU org. Si no hay fila,
 * devuelve defaults sin crearla (nunca falla por ausencia de config). */
export const getBotConfig = async (_req: AuthedRequest, res: Response) => {
  try {
    const config = await prisma.botConfig.findFirst();
    res.status(200).json(config ? toDTO(config) : { ...DEFAULTS });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** PUT /api/bot/config — upsert de la config del bot de SU org (scoped por org,
 * nunca por body). El body ya llegó validado/saneado por Zod. No se puede usar
 * upsert() en modelo tenant → findFirst + updateMany/create. */
export const updateBotConfig = async (req: AuthedRequest, res: Response) => {
  try {
    const data = req.body as {
      enabled: boolean;
      knowledgeBase: string;
      model?: string;
      dailyLimit?: number;
    };

    const existing = await prisma.botConfig.findFirst();
    if (existing) {
      // updateMany aplica el scope de org automáticamente (where con orgId).
      await prisma.botConfig.updateMany({ data });
    } else {
      // organizationId explícito para satisfacer los tipos de Prisma (la
      // extensión anti-fuga igual lo inyecta en runtime — mismo patrón que
      // chatService.startConversation). Los campos opcionales ausentes caen en
      // los @default del schema.
      await prisma.botConfig.create({
        data: { organizationId: requireOrganizationId(), ...data },
      });
    }

    const config = await prisma.botConfig.findFirst();
    res.status(200).json(toDTO(config!));
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export default { getBotConfig, updateBotConfig };
