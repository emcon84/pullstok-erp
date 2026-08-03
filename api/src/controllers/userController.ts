import { Response } from "express";
import AuthService from "../services/authServices";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";

/** ADMIN o MANAGEMENT: crea un usuario dentro de SU organización. */
export const createUser = async (req: AuthedRequest, res: Response) => {
  const { email, username, name, phone, address, password, role, branchIds } = req.body;
  if ((!email && !username) || !password) {
    return res
      .status(400)
      .json({ message: "Email o usuario y contraseña son requeridos" });
  }
  try {
    const organizationId = requireOrganizationId();
    const user = await AuthService.createUser({
      organizationId,
      email,
      username,
      name,
      phone,
      address,
      password,
      role,
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

    const branchIdsResult = branchIds?.length
      ? (
          await basePrisma.branchAssignment.findMany({
            where: { userId: user.id },
            select: { branchId: true },
          })
        ).map((a) => a.branchId)
      : [];

    res.status(201).json({ ...user, branchIds: branchIdsResult });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN o MANAGEMENT: lista los usuarios de SU organización. */
export const listUsers = async (_req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const users = await basePrisma.user.findMany({
      where: { organizationId },
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
    res.status(400).json({ message: error.message });
  }
};

/**
 * POST /api/users/:id/reset-password — Admin resets another user's password.
 * Bypasses the current-password check; only ADMIN/MANAGEMENT may call this.
 */
export const resetPassword = async (req: AuthedRequest, res: Response) => {
  try {
    const bcrypt = require("bcryptjs");
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres" });
    }

    const organizationId = requireOrganizationId();

    // Verify the target user belongs to the admin's organization
    const user = await prisma.user.findFirst({
      where: { id, organizationId },
    });
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true },
    });

    res.status(200).json({ message: "Contraseña actualizada" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/** ADMIN o MANAGEMENT: activa/desactiva un usuario de SU organización. */
export const setUserActive = async (req: AuthedRequest, res: Response) => {
  const { isActive } = req.body;
  try {
    const organizationId = requireOrganizationId();
    const result = await basePrisma.user.updateMany({
      where: { id: req.params.id, organizationId },
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

/** ADMIN o MANAGEMENT: elimina un usuario de SU organización. */
export const deleteUser = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const result = await basePrisma.user.deleteMany({
      where: { id: req.params.id, organizationId },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    res.status(200).json({ message: "Usuario eliminado" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN o MANAGEMENT: edita un usuario de SU organización. */
export const updateUser = async (req: AuthedRequest, res: Response) => {
  const { name, email, username, phone, address, role, branchIds } = req.body;
  try {
    const organizationId = requireOrganizationId();

    // Verificar que el usuario existe y pertenece a la org
    const existing = await basePrisma.user.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!existing) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Si se cambia email o username, verificar unicidad
    if (email && email !== existing.email) {
      const dup = await basePrisma.user.findFirst({
        where: { email, id: { not: req.params.id } },
      });
      if (dup) return res.status(400).json({ message: "Ya existe un usuario con ese email" });
    }
    if (username && username !== existing.username) {
      const dup = await basePrisma.user.findFirst({
        where: { username, id: { not: req.params.id } },
      });
      if (dup) return res.status(400).json({ message: "Ya existe un usuario con ese nombre de usuario" });
    }

    const updated = await basePrisma.user.update({
      where: { id: req.params.id },
      data: {
        name: name !== undefined ? (name || null) : undefined,
        email: email !== undefined ? (email || null) : undefined,
        username: username !== undefined ? (username || null) : undefined,
        phone: phone !== undefined ? (phone || null) : undefined,
        address: address !== undefined ? (address || null) : undefined,
        role: role !== undefined ? (role || existing.role) : undefined,
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        phone: true,
        address: true,
        role: true,
        isActive: true,
        organizationId: true,
      },
    });

    // Replace branch assignments if branchIds provided
    if (branchIds !== undefined) {
      await basePrisma.branchAssignment.deleteMany({
        where: { userId: req.params.id },
      });
      if (branchIds.length > 0) {
        await basePrisma.branchAssignment.createMany({
          data: branchIds.map((branchId: string) => ({
            userId: req.params.id,
            branchId,
          })),
        });
      }
    }

    const finalBranchIds = branchIds !== undefined
      ? branchIds
      : (
          await basePrisma.branchAssignment.findMany({
            where: { userId: req.params.id },
            select: { branchId: true },
          })
        ).map((a) => a.branchId);

    res.status(200).json({ ...updated, branchIds: finalBranchIds });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
