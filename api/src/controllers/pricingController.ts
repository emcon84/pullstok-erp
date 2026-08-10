import { Response } from "express";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";
import { recomputeForFactorSave } from "../services/priceLooseService";

// PricingSetting es 1:1 con Organization y NO está en TENANT_MODELS (ver
// db.ts): se accede siempre por organizationId vía basePrisma, mismo patrón
// que AppBranding y StoreSettings (B-02/B-10).
export const DEFAULT_BULK_FACTOR = 1.2;

/** GET /api/pricing-settings — factor de SU organización.
 *  Si no hay fila, devuelve el default 1.20 sin crear nada (B-02). */
export const getPricingSetting = async (_req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const setting = await basePrisma.pricingSetting.findUnique({
      where: { organizationId },
    });

    res.status(200).json({
      bulkFactor: setting?.bulkFactor ?? DEFAULT_BULK_FACTOR,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * PUT /api/pricing-settings — actualiza el factor org y recomputa.
 * BASIC plan → 403 (como branding). PRO/PREMIUM:
 *  - ?dryRun=true → preview: resuelve el mismo set (bulkFactor IS NULL) pero
 *    NO escribe; devuelve affected + muestra before/after (A-01).
 *  - sin dryRun → upsert del factor + recompute EN EL MISMO $transaction
 *    (B-05a): los overrides por producto quedan intactos.
 */
export const updatePricingSetting = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { bulkFactor } = req.body;
    const dryRun = req.query.dryRun === "true";

    const org = await basePrisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });
    if (!org || org.plan === "BASICO") {
      return res.status(403).json({ error: "PLAN_LIMIT", module: "pricing" });
    }

    if (dryRun) {
      const preview = await recomputeForFactorSave(
        basePrisma as any,
        organizationId,
        bulkFactor as number,
        { preview: true, sampleSize: Number(req.query.sampleSize) || 10 },
      );
      return res.status(200).json({ affected: preview.affected, sample: preview.sample });
    }

    const result = await basePrisma.$transaction(async (tx) => {
      const setting = await tx.pricingSetting.upsert({
        where: { organizationId },
        update: { bulkFactor: bulkFactor as number },
        create: { organizationId, bulkFactor: bulkFactor as number },
      });
      const recomputed = await recomputeForFactorSave(
        tx as any,
        organizationId,
        bulkFactor as number,
      );
      return {
        bulkFactor: setting.bulkFactor,
        recomputed: recomputed.affected,
      };
    });

    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export default { getPricingSetting, updatePricingSetting };