import { Request, Response } from "express";
import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";

/**
 * CRUD de marcas de "Precios por kilo" (líneas/sabores editables: MAXXIUM
 * CORDERO, OLD PRINCE PREMIUM, MASTER RP, ...). Tenant-scoped: PriceKgBrand
 * está en TENANT_MODELS (db.ts) → la extensión anti-fuga inyecta organizationId
 * al where/create; pasarlo explícito es redundante pero consistente con el
 * patrón del codebase (priceKgTypeController). En modelos tenant NO se permite
 * findUnique/update/delete → findFirst / findMany / updateMany / deleteMany /
 * create.
 */

export const listPriceKgBrands = async (_req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const brands = await prisma.priceKgBrand.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, keywords: true },
    });
    return res.status(200).json({ items: brands });
  } catch (error: any) {
    console.error("Error listando marcas de precio por kg:", error);
    return res.status(500).json({ message: "Error al listar las marcas de precio por kg" });
  }
};

export const createPriceKgBrand = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const brand = await prisma.priceKgBrand.create({
      data: { ...req.body, organizationId },
    });
    return res.status(201).json(brand);
  } catch (error: any) {
    if (error.message?.includes("Unique constraint") || error.code === "P2002") {
      return res.status(400).json({ message: "Ya existe una marca con ese nombre" });
    }
    console.error("Error creando marca de precio por kg:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const updatePriceKgBrand = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.priceKgBrand.findFirst({
      where: { id: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ message: "Marca no encontrada" });
    }

    await prisma.priceKgBrand.updateMany({
      where: { id: req.params.id },
      data: req.body,
    });

    const updated = await prisma.priceKgBrand.findFirst({
      where: { id: req.params.id },
      select: { id: true, name: true, keywords: true },
    });
    return res.status(200).json(updated);
  } catch (error: any) {
    if (error.message?.includes("Unique constraint") || error.code === "P2002") {
      return res.status(400).json({ message: "Ya existe una marca con ese nombre" });
    }
    return res.status(400).json({ message: error.message });
  }
};

export const deletePriceKgBrand = async (req: Request, res: Response) => {
  try {
    const result = await prisma.priceKgBrand.deleteMany({
      where: { id: req.params.id },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Marca no encontrada" });
    }
    return res.status(200).json({ message: "Marca eliminada" });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

const priceKgBrandController = {
  listPriceKgBrands,
  createPriceKgBrand,
  updatePriceKgBrand,
  deletePriceKgBrand,
};
export default priceKgBrandController;
