import { Response, NextFunction } from "express";
import { Plan } from "@prisma/client";
import { Request } from "express";
import { basePrisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";

// Facturar una venta (POST /sales/:saleId/invoice) requiere PRO o PREMIUM.
// Igual que checkInvoicingEnabled pero con plans ampliados; ambos leen el plan
// desde la DB porque el JWT no trae `plan` en el payload (solo
// userId/role/organizationId, ver jwtUtils.AccessTokenPayload).
const SALE_INVOICING_PLANS: Plan[] = ["PRO", "PREMIUM"];

export const checkSaleInvoicingEnabled = async (
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

    if (!org || !SALE_INVOICING_PLANS.includes(org.plan)) {
      return res.status(403).json({ error: "INVOICING_NOT_AVAILABLE" });
    }

    next();
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
