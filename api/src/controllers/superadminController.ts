import { Response } from "express";
import AuthService from "../services/authServices";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { Plan } from "@prisma/client";

/** Crea una organización (negocio cliente) + su usuario ADMIN inicial. */
export const createOrganization = async (req: AuthedRequest, res: Response) => {
  const { organizationName, slug, adminEmail, adminPassword, plan } = req.body;
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
      plan,
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
        plan: true,
        paidUntil: true,
        _count: { select: { users: true, products: true } },
      },
    });
    // El front deriva "vencido" comparando paidUntil con la fecha actual,
    // pero el dato es trivial de calcular acá también (evita duplicar la
    // lógica now() en cada consumidor del listado).
    const now = new Date();
    const orgsWithBillingStatus = orgs.map((org) => ({
      ...org,
      isPaymentOverdue: org.paidUntil ? org.paidUntil < now : true,
    }));
    res.status(200).json(orgsWithBillingStatus);
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

/** Cambia el plan de una organización (upgrade/downgrade manual). */
export const updateOrganizationPlan = async (
  req: AuthedRequest,
  res: Response,
) => {
  const { plan } = req.body as { plan: Plan };
  try {
    const org = await basePrisma.organization.update({
      where: { id: req.params.id },
      data: { plan },
    });
    res.status(200).json(org);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Registra un pago manual: extiende paidUntil un mes desde hoy (no acumula). */
export const registerOrganizationBilling = async (
  req: AuthedRequest,
  res: Response,
) => {
  try {
    const now = new Date();
    const paidUntil = new Date(now);
    paidUntil.setMonth(paidUntil.getMonth() + 1);

    const org = await basePrisma.organization.update({
      where: { id: req.params.id },
      data: { paidUntil },
    });
    res.status(200).json(org);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
