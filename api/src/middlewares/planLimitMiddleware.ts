import { Response, NextFunction } from "express";
import { basePrisma, prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { PLAN_LIMITS } from "../config/planLimits";
import { AuthedRequest } from "./authMiddleware";

/**
 * Middlewares de enforcement de límites de plan. Se enganchan DESPUÉS de la
 * autenticación (necesitan `organizationId` del tenant context) y ANTES del
 * controller que crea el recurso. Si el plan no tiene tope (`null`), pasan
 * directo. Si el recurso actual ya alcanzó/superó el límite, responden 403
 * con un body estructurado que el front puede interpretar sin parsear texto.
 */

const planLimitExceeded = (
  res: Response,
  resource: "users" | "products" | "storeProducts",
  limit: number,
  current: number,
) =>
  res.status(403).json({
    error: "PLAN_LIMIT",
    resource,
    limit,
    current,
  });

/** ADMIN crea un usuario nuevo: bloquea si la org ya está en el tope de su plan. */
export const checkUserLimit = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = requireOrganizationId();
    const org = await basePrisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const limit = PLAN_LIMITS[org.plan].maxUsers;
    if (limit === null) {
      return next();
    }
    const current = await basePrisma.user.count({ where: { organizationId } });
    if (current >= limit) {
      return planLimitExceeded(res, "users", limit, current);
    }
    next();
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Crea un producto nuevo: bloquea si la org ya está en el tope de su plan. */
export const checkProductLimit = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = requireOrganizationId();
    const org = await basePrisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const limit = PLAN_LIMITS[org.plan].maxProducts;
    if (limit === null) {
      return next();
    }
    const current = await prisma.product.count({ where: { organizationId } });
    if (current >= limit) {
      return planLimitExceeded(res, "products", limit, current);
    }
    next();
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * Publica un producto en la tienda: bloquea si la org ya llegó al tope de
 * productos publicables de su plan. Solo aplica al PUBLICAR
 * (`publishedToStore === true`); despublicar siempre se permite. BASICO tiene
 * tope 0 (no tiene tienda), así que no puede publicar ninguno.
 */
export const checkStoreProductLimit = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { publishedToStore } = req.body as { publishedToStore?: boolean };
    // Despublicar (o body sin el flag en true) nunca está limitado.
    if (publishedToStore !== true) {
      return next();
    }
    const organizationId = requireOrganizationId();
    const org = await basePrisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const limit = PLAN_LIMITS[org.plan].maxStoreProducts;
    if (limit === null) {
      return next();
    }
    const current = await prisma.product.count({
      where: { organizationId, publishedToStore: true },
    });
    if (current >= limit) {
      return planLimitExceeded(res, "storeProducts", limit, current);
    }
    next();
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
