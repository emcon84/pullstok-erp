import { basePrisma } from "../config/db";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from "../utils/jwtUtils";

class AuthService {
  static async login(email: string, password: string) {
    const user = await basePrisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new Error("Credenciales inválidas");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error("Credenciales inválidas");
    }

    const accessToken = generateAccessToken({
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
    });
    const refreshToken = generateRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /** Emite un nuevo access token a partir de un refresh token válido. */
  static async refresh(refreshToken: string) {
    let payload: { id: string; type?: string };
    try {
      payload = verifyToken<{ id: string; type?: string }>(refreshToken);
    } catch {
      throw new Error("Refresh token inválido o expirado");
    }
    if (payload.type !== "refresh") {
      throw new Error("El token provisto no es un refresh token");
    }

    const user = await basePrisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive) {
      throw new Error("Usuario no válido");
    }

    const accessToken = generateAccessToken({
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
    });
    return { accessToken };
  }

  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await basePrisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error("Usuario no encontrado");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new Error("La contraseña actual es incorrecta");
    }
    if (!newPassword || newPassword.length < 8) {
      throw new Error("La nueva contraseña debe tener al menos 8 caracteres");
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await basePrisma.user.update({
      where: { id: userId },
      data: { password: hashed, mustChangePassword: false },
    });
  }

  /** Devuelve el usuario autenticado + datos de su organización (gates del front: cambio de contraseña, onboarding). */
  static async me(userId: string) {
    const user = await basePrisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          select: { id: true, name: true, onboardingCompletedAt: true },
        },
      },
    });
    if (!user) {
      throw new Error("Usuario no encontrado");
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      mustChangePassword: user.mustChangePassword,
      organization: user.organization,
    };
  }

  /** SUPERADMIN: crea una organización nueva junto a su usuario ADMIN. */
  static async createOrganizationWithAdmin(params: {
    organizationName: string;
    slug: string;
    adminEmail: string;
    adminPassword: string;
  }) {
    const { organizationName, slug, adminEmail, adminPassword } = params;

    const existing = await basePrisma.user.findUnique({
      where: { email: adminEmail },
    });
    if (existing) {
      throw new Error("Ya existe un usuario con ese email");
    }

    const hashed = await bcrypt.hash(adminPassword, 10);
    return basePrisma.organization.create({
      data: {
        name: organizationName,
        slug,
        users: {
          create: {
            email: adminEmail,
            password: hashed,
            role: Role.ADMIN,
            mustChangePassword: true,
          },
        },
      },
      include: {
        users: { select: { id: true, email: true, role: true } },
      },
    });
  }

  /** ADMIN: crea un usuario (empleado o admin) dentro de SU organización. */
  static async createUser(params: {
    organizationId: string;
    email: string;
    password: string;
    role?: Role;
  }) {
    const { organizationId, email, password, role } = params;

    const existing = await basePrisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error("Ya existe un usuario con ese email");
    }

    const hashed = await bcrypt.hash(password, 10);
    return basePrisma.user.create({
      data: {
        email,
        password: hashed,
        role: role === Role.ADMIN ? Role.ADMIN : Role.EMPLOYEE,
        organizationId,
        mustChangePassword: true,
      },
      select: { id: true, email: true, role: true, organizationId: true },
    });
  }
}

export default AuthService;
