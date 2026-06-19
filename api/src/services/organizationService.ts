import { Industry } from "@prisma/client";
import { basePrisma } from "../config/db";
import { industryCategories } from "../config/industryCategories";

class OrganizationService {
  /** ADMIN: actualiza los datos del negocio de SU organización. */
  static async update(
    organizationId: string,
    data: {
      name?: string;
      address?: string;
      phone?: string;
      taxId?: string;
      industry?: Industry;
    },
  ) {
    const result = await basePrisma.organization.updateMany({
      where: { id: organizationId },
      data,
    });
    if (result.count === 0) {
      throw new Error("Organización no encontrada");
    }
    return basePrisma.organization.findFirst({ where: { id: organizationId } });
  }

  /** ADMIN: marca el onboarding como completo. Idempotente. */
  static async completeOnboarding(organizationId: string) {
    const org = await basePrisma.organization.findFirst({
      where: { id: organizationId },
    });
    if (!org) {
      throw new Error("Organización no encontrada");
    }
    if (org.onboardingCompletedAt) {
      return org;
    }

    await basePrisma.organization.updateMany({
      where: { id: organizationId },
      data: { onboardingCompletedAt: new Date() },
    });
    return basePrisma.organization.findFirst({ where: { id: organizationId } });
  }

  /** Categorías sugeridas para precargar el paso 2 del wizard según el rubro. */
  static getSuggestedCategories(industry: Industry) {
    return industryCategories[industry];
  }
}

export default OrganizationService;
