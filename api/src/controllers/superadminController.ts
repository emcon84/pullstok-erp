import { Response } from "express";
import AuthService from "../services/authServices";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";

/** Crea una organización (negocio cliente) + su usuario ADMIN inicial. */
export const createOrganization = async (req: AuthedRequest, res: Response) => {
  const { organizationName, slug, adminEmail, adminPassword } = req.body;
  if (!organizationName || !slug || !adminEmail || !adminPassword) {
    return res.status(400).json({
      message:
        "Faltan campos: organizationName, slug, adminEmail, adminPassword",
    });
  }
  try {
    const org = await AuthService.createOrganizationWithAdmin({
      organizationName,
      slug,
      adminEmail,
      adminPassword,
    });
    res.status(201).json(org);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Lista todas las organizaciones de la plataforma. */
export const listOrganizations = async (_req: AuthedRequest, res: Response) => {
  try {
    const orgs = await basePrisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
        _count: { select: { users: true, products: true } },
      },
    });
    res.status(200).json(orgs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/** Activa/suspende una organización (p. ej. cliente que dejó de pagar). */
export const setOrganizationActive = async (
  req: AuthedRequest,
  res: Response,
) => {
  const { isActive } = req.body;
  try {
    const org = await basePrisma.organization.update({
      where: { id: req.params.id },
      data: { isActive: Boolean(isActive) },
    });
    res.status(200).json(org);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
