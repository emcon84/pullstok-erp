import { createHmac } from "crypto";
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

// ---------------------------------------------------------------------------
// Balances-view token (customer balances summary lock)
// ---------------------------------------------------------------------------
// Short-lived proof that a user typed the balances password. It is signed with
// a key DERIVED from JWT_SECRET (HMAC with a fixed label), so it can never be
// verified as a session token (and a session token never verifies here), plus a
// `purpose` claim as a second guard. Bound to user + organization.

export const BALANCES_TOKEN_TTL_SEC = 15 * 60;
const BALANCES_PURPOSE = "balances-view";

export interface BalancesTokenPayload {
  sub: string;
  organizationId: string;
  purpose: typeof BALANCES_PURPOSE;
}

const getBalancesSecret = (): string =>
  createHmac("sha256", getSecret()).update(BALANCES_PURPOSE).digest("hex");

export const generateBalancesToken = (userId: string, organizationId: string): string =>
  jwt.sign({ organizationId, purpose: BALANCES_PURPOSE }, getBalancesSecret(), {
    subject: userId,
    expiresIn: BALANCES_TOKEN_TTL_SEC,
  } as SignOptions);

/** Throws on bad signature, expiry or wrong purpose. */
export const verifyBalancesToken = (token: string): BalancesTokenPayload => {
  const payload = jwt.verify(token, getBalancesSecret()) as BalancesTokenPayload;
  if (payload.purpose !== BALANCES_PURPOSE) {
    throw new Error("Not a balances token");
  }
  return payload;
};
