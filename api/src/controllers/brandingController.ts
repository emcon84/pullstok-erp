import { Response } from "express";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";

// AppBranding es 1:1 con Organization y NO está en TENANT_MODELS (ver db.ts):
// se accede siempre por organizationId vía basePrisma, mismo patrón que
// StoreSettings y BotConfig.
const DEFAULT_PRIMARY_COLOR = "#111827";

/** GET /api/app-branding — devuelve el branding de SU organización.
 *  Si no hay fila, devuelve defaults sin crear nada. */
export const getBranding = async (_req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const branding = await basePrisma.appBranding.findUnique({
      where: { organizationId },
    });

    res.status(200).json({
      primaryColor: branding?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
      logoUrl: branding?.logoUrl ?? null,
      faviconUrl: branding?.faviconUrl ?? null,
      displayName: branding?.displayName ?? null,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** PUT /api/app-branding — upsert del branding de SU organización.
 *  BASIC plan → 403. PRO/PREMIUM → upsert vía basePrisma.
 *  El body ya llegó validado/saneado por Zod. */
export const updateBranding = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const data = req.body;

    // Plan check: BASIC no tiene acceso a branding
    const org = await basePrisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });

    if (!org || org.plan === "BASICO") {
      return res.status(403).json({ error: "PLAN_LIMIT", module: "branding" });
    }

    const branding = await basePrisma.appBranding.upsert({
      where: { organizationId },
      update: data,
      create: { organizationId, ...data },
    });

    res.status(200).json({
      primaryColor: branding.primaryColor,
      logoUrl: branding.logoUrl,
      faviconUrl: branding.faviconUrl,
      displayName: branding.displayName,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export default { getBranding, updateBranding };
