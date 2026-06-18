import { Request, Response, NextFunction } from "express";
import { verifyToken, AccessTokenPayload } from "../utils/jwtUtils";
import { runWithTenant, UserRole } from "../config/tenantContext";

export interface AuthedRequest extends Request {
  user?: AccessTokenPayload;
}

/**
 * Verifica el JWT y, además, establece el CONTEXTO DE TENANT para todo el
 * resto del request (vía AsyncLocalStorage). Gracias a esto, la extension de
 * Prisma puede scopear automáticamente por organización sin que cada handler
 * tenga que acordarse de filtrar.
 */
export const authenticate = (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Acceso denegado: falta token." });
  }

  try {
    const payload = verifyToken<AccessTokenPayload>(token);
    req.user = payload;
    runWithTenant(
      {
        userId: payload.id,
        role: payload.role,
        organizationId: payload.organizationId ?? null,
      },
      () => next(),
    );
  } catch {
    return res.status(401).json({ message: "Token inválido o expirado." });
  }
};

/** Alias para compatibilidad con las rutas existentes. */
export const authenticateJWT = authenticate;

/** Restringe una ruta a uno o más roles. Usar después de `authenticate`. */
export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "No tenés permiso para esta acción." });
    }
    next();
  };
};
