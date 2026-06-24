import { basePrisma } from "../config/db";
import bcrypt from "bcryptjs";
import { Role, Plan } from "@prisma/client";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from "../utils/jwtUtils";

class AuthService {
  static async login(email: string, password: string) {
    const user = await basePrisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });
    if (!user || !user.isActive) {
      throw new Error("Credenciales inválidas");
    }

    // Kill switch: si el usuario pertenece a una organización (el SUPERADMIN
    // tiene organizationId=null y nunca pasa por este chequeo) y esa
    // organización fue suspendida por el superadmin, se rechaza el login.
    // Riesgo aceptado: una sesión ya iniciada antes de la suspensión sigue
    // viva hasta que expire el access token (JWT_EXPIRES_IN, hasta 8h),
    // porque el middleware `authenticate` no vuelve a consultar la DB en
    // cada request (ver design de planes-y-billing).
    if (user.organizationId && !user.organization?.isActive) {
      throw new Error(
        "Tu organización está suspendida, contactá al administrador.",
      );
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

    const user = await basePrisma.user.findUnique({
      where: { id: payload.id },
      include: { organization: true },
    });
    if (!user || !user.isActive) {
      throw new Error("Usuario no válido");
    }

    // Mismo kill switch que en login (ver comentario ahí): refresh también
    // debe rechazar usuarios de una organización suspendida, si no el access
    // token se sigue renovando indefinidamente sin re-chequear el estado.
    if (user.organizationId && !user.organization?.isActive) {
      throw new Error(
        "Tu organización está suspendida, contactá al administrador.",
      );
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
          select: {
            id: true,
            name: true,
            slug: true,
            onboardingCompletedAt: true,
            plan: true,
            paidUntil: true,
            isActive: true,
          },
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
    plan?: Plan;
  }) {
    const { organizationName, slug, adminEmail, adminPassword, plan } = params;

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
        plan: plan ?? Plan.BASICO,
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
