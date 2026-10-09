import { Request, Response } from "express";
import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";

// Violación de unicidad de Prisma: nombre (case-sensitive en el índice) o
// código legado repetidos dentro de la org.
const uniqueViolationMessage = (error: any): string | null => {
  if (error?.code !== "P2002") return null;
  const fields = String(error?.meta?.target ?? "");
  if (fields.includes("code")) return "Ya existe un proveedor con ese código";
  if (fields.includes("name")) return "Ya existe un proveedor con ese nombre";
  return "Ya existe un proveedor con esos datos";
};

// Cuenta contable vinculada que viaja en las respuestas.
const accountInclude = {
  account: { select: { id: true, code: true, shortCode: true, name: true } },
} as const;

/**
 * Valida que la cuenta exista en la org y sea imputable. Devuelve el mensaje
 * de error (400) o null si es válida.
 */
const validateAccountLink = async (organizationId: string, accountId: string): Promise<string | null> => {
  const account = await prisma.account.findFirst({
    where: { id: accountId, organizationId },
    select: { isPostable: true },
  });
  if (!account) return "La cuenta contable no existe";
  if (!account.isPostable) return "La cuenta contable debe ser imputable";
  return null;
};

/** ¿Hay otro proveedor de la org con el mismo nombre ignorando mayúsculas? */
const nameTaken = async (organizationId: string, name: string, excludeId?: string) => {
  const existing = await prisma.provider.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return !!existing;
};

/**
 * GET /providers — proveedores de la org (sdd/alican-wholesale-price-list/
 * providers), por nombre asc. Tenant-scoped: la extensión anti-fuga de db.ts
 * (Provider en TENANT_MODELS) ya inyecta organizationId al where; pasarlo
 * explícito es redundante pero consistente con el patrón del codebase.
 *
 * Back-compat: la respuesta sigue siendo `{ items }` y cada item mantiene
 * `id`/`name` (los selectores de planilla solo usan esos); ahora trae además
 * los datos administrativos. Sin query params devuelve TODOS (activos e
 * inactivos). Filtros opcionales: ?q= (nombre/código/CUIT) y
 * ?active=true|false.
 */
export const listProviders = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";
    const active = req.query?.active;
    const where: any = { organizationId };
    if (active === "true") where.isActive = true;
    else if (active === "false") where.isActive = false;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { taxId: { contains: q, mode: "insensitive" } },
      ];
    }
    const providers = await prisma.provider.findMany({
      where,
      orderBy: { name: "asc" },
      include: accountInclude,
    });
    return res.status(200).json({ items: providers });
  } catch (error: any) {
    console.error("Error listando proveedores:", error);
    return res.status(500).json({ message: "Error al listar los proveedores" });
  }
};

/** GET /providers/:id */
export const getProviderById = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const provider = await prisma.provider.findFirst({
      where: { id: req.params.id, organizationId },
      include: accountInclude,
    });
    if (!provider) return res.status(404).json({ message: "Proveedor no encontrado" });
    return res.status(200).json(provider);
  } catch (error: any) {
    console.error("Error obteniendo proveedor:", error);
    return res.status(500).json({ message: "Error al obtener el proveedor" });
  }
};

/** POST /providers — organizationId lo agrega la extensión de Prisma. */
export const createProvider = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    // La unicidad por nombre es case-insensitive (la planilla mayorista
    // reutiliza por nombre ignorando mayúsculas), el índice solo cubre el caso exacto.
    if (await nameTaken(organizationId, req.body.name)) {
      return res.status(409).json({ message: "Ya existe un proveedor con ese nombre" });
    }
    if (req.body.accountId) {
      const accountError = await validateAccountLink(organizationId, req.body.accountId);
      if (accountError) return res.status(400).json({ message: accountError });
    }
    const provider = await prisma.provider.create({
      data: { ...req.body, organizationId },
      include: accountInclude,
    });
    return res.status(201).json(provider);
  } catch (error: any) {
    const dup = uniqueViolationMessage(error);
    if (dup) return res.status(409).json({ message: dup });
    console.error("Error creando proveedor:", error);
    return res.status(500).json({ message: "Error al crear el proveedor" });
  }
};

/** PUT /providers/:id — updateMany (scope por org), nunca update singular. */
export const updateProvider = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    if (typeof req.body.name === "string" && (await nameTaken(organizationId, req.body.name, req.params.id))) {
      return res.status(409).json({ message: "Ya existe un proveedor con ese nombre" });
    }
    if (req.body.accountId) {
      const accountError = await validateAccountLink(organizationId, req.body.accountId);
      if (accountError) return res.status(400).json({ message: accountError });
    }
    const result = await prisma.provider.updateMany({
      where: { id: req.params.id, organizationId },
      data: req.body,
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }
    const provider = await prisma.provider.findFirst({
      where: { id: req.params.id, organizationId },
      include: accountInclude,
    });
    return res.status(200).json(provider);
  } catch (error: any) {
    const dup = uniqueViolationMessage(error);
    if (dup) return res.status(409).json({ message: dup });
    console.error("Error actualizando proveedor:", error);
    return res.status(500).json({ message: "Error al actualizar el proveedor" });
  }
};

/**
 * DELETE /providers/:id — borrado duro. Los productos NO se borran: la FK
 * Product.providerId es onDelete SetNull. Para conservar el historial el front
 * desactiva (PUT isActive=false) en vez de borrar.
 */
export const deleteProvider = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const result = await prisma.provider.deleteMany({
      where: { id: req.params.id, organizationId },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }
    return res.status(200).json({ message: "Proveedor eliminado" });
  } catch (error: any) {
    console.error("Error eliminando proveedor:", error);
    return res.status(500).json({ message: "Error al eliminar el proveedor" });
  }
};

const providerController = {
  listProviders,
  getProviderById,
  createProvider,
  updateProvider,
  deleteProvider,
};
export default providerController;
