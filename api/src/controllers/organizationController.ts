import { Response } from "express";
import { Industry } from "@prisma/client";
import OrganizationService from "../services/organizationService";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";

/** ADMIN: actualiza los datos del negocio de SU organización. */
export const updateOrganization = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const organization = await OrganizationService.update(organizationId, req.body);
    res.status(200).json(organization);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN: marca el onboarding de SU organización como completo. */
export const completeOnboarding = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const organization = await OrganizationService.completeOnboarding(organizationId);
    res.status(200).json(organization);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Categorías sugeridas para el paso 2 del wizard, según el rubro indicado. */
export const getSuggestedCategories = async (req: AuthedRequest, res: Response) => {
  const industry = req.query.industry as string;
  const validIndustries = ["FERRETERIA", "KIOSCO", "INDUMENTARIA", "ALMACEN", "OTHER"];
  if (!industry || !validIndustries.includes(industry)) {
    return res.status(400).json({ message: "industry inválida o faltante" });
  }
  const categories = OrganizationService.getSuggestedCategories(industry as Industry);
  res.status(200).json({ categories });
};
