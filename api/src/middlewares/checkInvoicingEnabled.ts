import { Response, NextFunction } from "express";
import { Plan } from "@prisma/client";
import { Request } from "express";
import { basePrisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";

// Facturación es PREMIUM-only. A diferencia de checkStoreEnabled (que lee
// req.org.plan ya resuelto por tenantBySlug en el router público), esta ruta
// usa authenticateJWT: el JWT NO trae `plan` en el payload (solo
// userId/role/organizationId, ver jwtUtils.AccessTokenPayload), así que hay
// que resolverlo con una query liviana por PK a Organization. Se usa
// basePrisma (no el cliente scopeado) porque Organization no está en
// TENANT_MODELS y el lookup es por clave primaria simple.
const INVOICING_PLANS: Plan[] = ["PREMIUM"];

export const checkInvoicingEnabled = async (
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

    if (!org || !INVOICING_PLANS.includes(org.plan)) {
      return res.status(403).json({ error: "INVOICING_NOT_AVAILABLE" });
    }

    next();
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
