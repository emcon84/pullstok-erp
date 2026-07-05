import { Response, NextFunction, Request } from "express";
import { Plan } from "@prisma/client";
import { basePrisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";

// Gate del bot IA: feature PREMIUM-only (mismo criterio que BOT_PLAN en
// botService.ts, más restrictivo que checkStoreEnabled/checkInvoicingEnabled).
// A diferencia de checkStoreEnabled (que lee req.org.plan resuelto por
// tenantBySlug en el router público), estas rutas usan authenticateJWT: el JWT
// NO trae `plan` en el payload, así que se resuelve con una query liviana por PK
// a Organization. Se usa basePrisma porque Organization no está en TENANT_MODELS.
const BOT_PLANS: Plan[] = ["PREMIUM"];

export const checkBotEnabled = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = requireOrganizationId();
    const org = await basePrisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });

    if (!org || !BOT_PLANS.includes(org.plan)) {
      // Shape consistente con checkInvoicingEnabled: el front detecta el `error`
      // para mostrar el estado "bloqueado / mejorá tu plan".
      return res.status(403).json({ error: "BOT_NOT_AVAILABLE" });
    }

    next();
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
