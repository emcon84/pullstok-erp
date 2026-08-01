import { Response } from "express";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";

// StoreSettings es 1:1 con Organization y NO está en TENANT_MODELS (ver
// storeController.ts): se accede siempre por organizationId vía basePrisma,
// nunca por id propio, para que no haya forma de leer/escribir la fila de
// otra organización aunque alguien adivine un id.
const DEFAULT_PRIMARY_COLOR = "#6d28d9";

/** ADMIN: devuelve la StoreSettings de SU organización. Create-on-read: si
 * todavía no existe fila, se devuelven los defaults sin crear nada (recién
 * se persiste algo cuando el owner guarda por primera vez vía PUT). */
export const getStoreSettings = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const settings = await basePrisma.storeSettings.findUnique({
      where: { organizationId },
    });

    res.status(200).json({
      primaryColor: settings?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
      logoUrl: settings?.logoUrl ?? null,
      bannerUrl: settings?.bannerUrl ?? null,
      tagline: settings?.tagline ?? null,
      showNewsletter: settings?.showNewsletter ?? true,
      showBanner: settings?.showBanner ?? true,
      badges: (settings?.badges as { title: string; subtitle: string }[] | null) ?? null,
      contactEmail: settings?.contactEmail ?? null,
      contactPhone: settings?.contactPhone ?? null,
      address: settings?.address ?? null,
      // Sucursal que alimenta la tienda online (spec S1). null = sin
      // configurar → la tienda usa la casa central (fallback).
      storeBranchId: settings?.storeBranchId ?? null,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN: upsert de la StoreSettings de SU organización (scoped por
 * organizationId, nunca por body). El body ya llegó validado/saneado por
 * Zod (validate() reemplaza req.body por el resultado parseado — campos
 * desconocidos quedan afuera, sin mass-assignment posible). */
export const updateStoreSettings = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const data = req.body;

    // Spec S1: storeBranchId debe referenciar una Branch ACTIVA de la org. Si
    // no existe → 400 (evita apuntar la tienda a una sucursal ajena, inactiva
    // o inexistente). null (limpiar la config) no valida nada: la tienda cae
    // al fallback de casa central.
    if (data.storeBranchId != null) {
      const branch = await basePrisma.branch.findFirst({
        where: { id: data.storeBranchId, organizationId, isActive: true },
      });
      if (!branch) {
        return res.status(400).json({
          message: "La sucursal configurada no existe o no está activa",
        });
      }
    }

    const settings = await basePrisma.storeSettings.upsert({
      where: { organizationId },
      update: data,
      create: { organizationId, ...data },
    });

    res.status(200).json({
      primaryColor: settings.primaryColor,
      logoUrl: settings.logoUrl,
      bannerUrl: settings.bannerUrl,
      tagline: settings.tagline,
      showNewsletter: settings.showNewsletter,
      showBanner: settings.showBanner,
      badges: settings.badges as { title: string; subtitle: string }[] | null,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      address: settings.address,
      storeBranchId: settings.storeBranchId,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export default { getStoreSettings, updateStoreSettings };
