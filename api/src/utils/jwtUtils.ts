import jwt, { SignOptions } from "jsonwebtoken";
import { UserRole } from "../config/tenantContext";

export interface AccessTokenPayload {
  id: string;
  role: UserRole;
  organizationId: string | null;
}

const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET no está configurado en el entorno");
  }
  return secret;
};

export const generateAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  } as SignOptions);

export const generateRefreshToken = (userId: string): string =>
  jwt.sign({ id: userId, type: "refresh" }, getSecret(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
  } as SignOptions);

export const verifyToken = <T = unknown>(token: string): T =>
  jwt.verify(token, getSecret()) as T;

// ---------------------------------------------------------------------------
// Guest token (chat cliente↔operador, FASE A)
// ---------------------------------------------------------------------------
// Un visitante de la tienda pública no tiene cuenta: se lo identifica con un
// JWT "de invitado" atado a UNA conversación concreta. Firmado con el MISMO
// secreto que el token de operador (getSecret) pero con role "GUEST" y
// expiración larga (default 7d) para que pueda retomar la conversación si
// vuelve. El role discrimina guest de operador (nunca se aceptan cruzados).

export interface GuestTokenPayload {
  role: "GUEST";
  organizationId: string;
  conversationId: string;
  guestEmail: string;
}

export const generateGuestToken = (
  payload: Omit<GuestTokenPayload, "role">,
): string =>
  jwt.sign({ ...payload, role: "GUEST" }, getSecret(), {
    expiresIn: process.env.JWT_GUEST_EXPIRES_IN ?? "7d",
  } as SignOptions);

/**
 * Verifica un guest token y garantiza que sea realmente de tipo GUEST. Lanza
 * si la firma es inválida/expiró o si el role no es "GUEST" (p.ej. alguien
 * mandó un token de operador donde se esperaba uno de invitado).
 */
export const verifyGuestToken = (token: string): GuestTokenPayload => {
  const payload = jwt.verify(token, getSecret()) as GuestTokenPayload;
  if (payload.role !== "GUEST") {
    throw new Error("No es un guest token");
  }
  return payload;
};
