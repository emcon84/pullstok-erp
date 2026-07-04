import { Request, Response, NextFunction } from "express";
import { verifyGuestToken, GuestTokenPayload } from "../utils/jwtUtils";
import { runWithTenant } from "../config/tenantContext";

export interface GuestRequest extends Request {
  guest?: {
    organizationId: string;
    conversationId: string;
    guestEmail: string;
  };
}

/**
 * Autentica a un visitante de la tienda pública mediante su "guest token" (ver
 * jwtUtils.generateGuestToken). Deja `req.guest` con la conversación y la org
 * del token y, además, establece el CONTEXTO DE TENANT (runWithTenant) usando
 * el organizationId del TOKEN — así la extensión anti-fuga de Prisma scopea las
 * queries por esa org sin depender de que tenantBySlug haya corrido antes.
 *
 * Seguridad: rechaza (401) si falta el token, si la firma es inválida/expiró o
 * si el token NO es de tipo GUEST (p.ej. un token de operador). El guest queda
 * atado a SU conversación (la del token); el handler NUNCA debe leer un
 * conversationId del body.
 */
export const requireGuest = (
  req: GuestRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Acceso denegado: falta token." });
  }

  let payload: GuestTokenPayload;
  try {
    payload = verifyGuestToken(token);
  } catch {
    return res.status(401).json({ message: "Token inválido o expirado." });
  }

  req.guest = {
    organizationId: payload.organizationId,
    conversationId: payload.conversationId,
    guestEmail: payload.guestEmail,
  };

  // Contexto de tenant a partir del token (no del slug): el guest solo puede
  // tocar datos de la org de su conversación. userId/role puramente nominales
  // (mismo patrón que tenantBySlug con "public"/"EMPLOYEE").
  runWithTenant(
    { userId: "guest", role: "EMPLOYEE", organizationId: payload.organizationId },
    () => next(),
  );
};
