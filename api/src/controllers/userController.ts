import { Response } from "express";
import AuthService from "../services/authServices";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";

/** ADMIN o MANAGEMENT: crea un usuario dentro de SU organización. */
export const createUser = async (req: AuthedRequest, res: Response) => {
  const { email, username, password, role } = req.body;
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
      password,
      role,
    });
    res.status(201).json(user);
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
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    res.status(200).json(users);
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
