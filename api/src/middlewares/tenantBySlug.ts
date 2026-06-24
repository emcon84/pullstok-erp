import { Request, Response, NextFunction } from "express";
import { Organization } from "@prisma/client";
import { basePrisma } from "../config/db";
import { runWithTenant } from "../config/tenantContext";

export interface PublicStoreRequest extends Request {
  org?: Organization;
}

// Subdominios reservados: nunca son el slug de un negocio.
const RESERVED_SLUGS = new Set(["pullstok", "www"]);

/**
 * Resuelve la Organization a partir del subdominio (Host header) y, si la
 * encuentra, corre el resto del request DENTRO de runWithTenant — así la
 * extensión anti-fuga de Prisma (db.ts) scopea automáticamente todas las
 * queries tenant-scoped por esta organización, igual que hace authMiddleware
 * con el JWT, pero sin JWT (router público, sin auth).
 *
 * Fallback de slug para testing local (sin DNS wildcard todavía): query param
 * `?slug=` o header `X-Tenant-Slug`, además del Host header real.
 */
export const tenantBySlug = async (
  req: PublicStoreRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const host = req.header("host") ?? "";
    const hostSlug = host.split(".")[0]?.split(":")[0];
    const slug =
      (req.query.slug as string | undefined) ||
      req.header("x-tenant-slug") ||
      hostSlug;

    if (!slug || RESERVED_SLUGS.has(slug)) {
      return res.status(404).json({ message: "Not found" });
    }

    const org = await basePrisma.organization.findFirst({
      where: { slug, isActive: true },
    });

    // 404 genérico: nunca revelar si el slug existe o no.
    if (!org) {
      return res.status(404).json({ message: "Not found" });
    }

    req.org = org;
    runWithTenant(
      { userId: "public", role: "EMPLOYEE", organizationId: org.id },
      () => next(),
    );
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
