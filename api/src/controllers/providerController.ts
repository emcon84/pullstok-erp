import { Request, Response } from "express";
import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";

/**
 * GET /providers — proveedores de la org (sdd/alican-wholesale-price-list/
 * providers), por nombre asc. Tenant-scoped: la extensión anti-fuga de db.ts
 * (Provider en TENANT_MODELS) ya inyecta organizationId al where; pasarlo
 * explícito es redundante pero consistente con el patrón del codebase.
 */
export const listProviders = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const providers = await prisma.provider.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return res.status(200).json({ items: providers });
  } catch (error: any) {
    console.error("Error listando proveedores:", error);
    return res.status(500).json({ message: "Error al listar los proveedores" });
  }
};

const providerController = { listProviders };
export default providerController;
