import { Request, Response } from "express";
import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";

/**
 * CRUD de tipos de "Precios por kilo" (etapas de vida: Adulto, Cachorro,
 * Kitten, ...). Tenant-scoped: PriceKgType está en TENANT_MODELS (db.ts) →
 * la extensión anti-fuga inyecta organizationId al where/create; pasarlo
 * explícito es redundante pero consistente con el patrón del codebase
 * (providerController). En modelos tenant NO se permite findUnique/update/
 * delete → findFirst / findMany / updateMany / deleteMany / create.
 */

export const listPriceKgTypes = async (_req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const types = await prisma.priceKgType.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, synonyms: true },
    });
    return res.status(200).json({ items: types });
  } catch (error: any) {
    console.error("Error listando tipos de precio por kg:", error);
    return res.status(500).json({ message: "Error al listar los tipos de precio por kg" });
  }
};

export const createPriceKgType = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const type = await prisma.priceKgType.create({
      data: { ...req.body, organizationId },
    });
    return res.status(201).json(type);
  } catch (error: any) {
    if (error.message?.includes("Unique constraint") || error.code === "P2002") {
      return res.status(400).json({ message: "Ya existe un tipo con ese nombre" });
    }
    console.error("Error creando tipo de precio por kg:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const updatePriceKgType = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.priceKgType.findFirst({
      where: { id: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ message: "Tipo no encontrado" });
    }

    await prisma.priceKgType.updateMany({
      where: { id: req.params.id },
      data: req.body,
    });

    const updated = await prisma.priceKgType.findFirst({
      where: { id: req.params.id },
      select: { id: true, name: true, synonyms: true },
    });
    return res.status(200).json(updated);
  } catch (error: any) {
    if (error.message?.includes("Unique constraint") || error.code === "P2002") {
      return res.status(400).json({ message: "Ya existe un tipo con ese nombre" });
    }
    return res.status(400).json({ message: error.message });
  }
};

export const deletePriceKgType = async (req: Request, res: Response) => {
  try {
    const result = await prisma.priceKgType.deleteMany({
      where: { id: req.params.id },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Tipo no encontrado" });
    }
    return res.status(200).json({ message: "Tipo eliminado" });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

const priceKgTypeController = {
  listPriceKgTypes,
  createPriceKgType,
  updatePriceKgType,
  deletePriceKgType,
};
export default priceKgTypeController;
