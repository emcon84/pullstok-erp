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

/**
 * Borra TODAS las conversaciones de un comercio (y sus mensajes en cascada,
 * onDelete Cascade en Message). Uso: limpiar los chats de prueba que quedan
 * pegados. Como es acción de plataforma sobre CUALQUIER org, usa basePrisma
 * (sin scope automático) y filtra explícito por organizationId. Message NO es
 * tenant-model: se borra vía cascade de Conversation, no hace falta borrarlo
 * aparte.
 */
export const clearOrganizationConversations = async (
  req: AuthedRequest,
  res: Response,
) => {
  const { id } = req.params;
  try {
    const org = await basePrisma.organization.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!org) {
      return res.status(404).json({ message: "Organización no encontrada." });
    }

    const { count } = await basePrisma.conversation.deleteMany({
      where: { organizationId: id },
    });
    res.status(200).json({ deleted: count });
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

// ── SUPERADMIN: User CRUD per organization ──────────────────

/** SUPERADMIN: lista los usuarios de una organización específica. */
export const listOrgUsers = async (req: AuthedRequest, res: Response) => {
  const { orgId } = req.params;
  try {
    // Verify org exists first
    const org = await basePrisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) {
      return res.status(404).json({ message: "Organización no encontrada" });
    }

    const users = await basePrisma.user.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        branchAssignments: {
          select: { branchId: true },
        },
      },
    });

    const mapped = users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      branchIds: u.branchAssignments.map((a) => a.branchId),
    }));

    res.status(200).json(mapped);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/** SUPERADMIN: crea un usuario en una organización específica. */
export const createOrgUser = async (req: AuthedRequest, res: Response) => {
  const { orgId } = req.params;
  const { email, username, name, phone, address, password, role, branchIds } = req.body;
  if ((!email && !username) || !password) {
    return res
      .status(400)
      .json({ message: "Email o usuario y contraseña son requeridos" });
  }
  try {
    // Verify org exists
    const org = await basePrisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) {
      return res.status(404).json({ message: "Organización no encontrada" });
    }

    // Check uniqueness
    if (email) {
      const existing = await basePrisma.user.findFirst({
        where: { OR: [{ email }, ...(username ? [{ username }] : [])] },
      });
      if (existing) {
        return res.status(400).json({
          message:
            existing.email === email
              ? "Ya existe un usuario con ese email"
              : "Ya existe un usuario con ese nombre de usuario",
        });
      }
    } else if (username) {
      const existing = await basePrisma.user.findUnique({
        where: { username },
      });
      if (existing) {
        return res
          .status(400)
          .json({ message: "Ya existe un usuario con ese nombre de usuario" });
      }
    }

    const bcrypt = await import("bcryptjs");
    const hashed = await bcrypt.default.hash(password, 10);

    const user = await basePrisma.user.create({
      data: {
        email: email ?? null,
        username: username ?? null,
        name: name ?? null,
        phone: phone ?? null,
        address: address ?? null,
        password: hashed,
        role: role ?? "EMPLOYEE",
        organizationId: orgId,
        mustChangePassword: false,
      },
      select: { id: true, email: true, role: true, organizationId: true },
    });

    // Assign branches if provided
    if (branchIds && branchIds.length > 0) {
      await basePrisma.branchAssignment.createMany({
        data: branchIds.map((branchId: string) => ({
          userId: user.id,
          branchId,
        })),
      });
    }

    res.status(201).json(user);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** SUPERADMIN: activa/desactiva un usuario en una organización específica. */
export const toggleOrgUserActive = async (
  req: AuthedRequest,
  res: Response,
) => {
  const { orgId, userId } = req.params;
  const { isActive } = req.body;
  try {
    const result = await basePrisma.user.updateMany({
      where: { id: userId, organizationId: orgId },
      data: { isActive: Boolean(isActive) },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    res.status(200).json({ message: "Usuario actualizado" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** SUPERADMIN: elimina un usuario de una organización específica. */
export const deleteOrgUser = async (req: AuthedRequest, res: Response) => {
  const { orgId, userId } = req.params;
  try {
    const result = await basePrisma.user.deleteMany({
      where: { id: userId, organizationId: orgId },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    res.status(200).json({ message: "Usuario eliminado" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** SUPERADMIN: lista las sucursales de una organización específica. */
export const listOrgBranches = async (req: AuthedRequest, res: Response) => {
  const { orgId } = req.params;
  try {
    const org = await basePrisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) {
      return res.status(404).json({ message: "Organización no encontrada" });
    }

    const branches = await basePrisma.branch.findMany({
      where: { organizationId: orgId },
    });
    res.status(200).json(branches);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
