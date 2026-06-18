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
