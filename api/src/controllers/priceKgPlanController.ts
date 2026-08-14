import { Request, Response } from "express";
import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";

/**
 * Planilla "Precios por kilo": matriz marca (filas) × tipo (columnas) →
 * precio por kilo. Cada celda es un PriceKgPrice (par marca+tipo único por
 * org Y por especie: una marca/tipo AMBOS puede tener precios distintos en la
 * planilla de Perros y en la de Gatos). A diferencia de la propagación
 * anterior, NO se matchean nombres de producto ni se toca product.priceKgSuelto:
 * acá solo se persiste la planilla.
 * Tenant-scoped: PriceKgPrice está en TENANT_MODELS (db.ts) → la extensión
 * anti-fuga inyecta organizationId en el scope del request. DENTRO del
 * $transaction el tx NO hereda el scope automático (patrón priceLooseService),
 * así que organizationId se pasa EXPLÍCITO en toda query para no filtrar
 * cross-tenant.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const getPriceKgPlan = async (_req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const items = await prisma.priceKgPrice.findMany({
      where: { organizationId },
      select: {
        id: true,
        brandId: true,
        typeId: true,
        species: true,
        priceKg: true,
      },
    });
    return res.status(200).json({ items });
  } catch (error: any) {
    console.error("Error listando la planilla de precios por kg:", error);
    return res.status(500).json({ message: "Error al listar la planilla de precios por kg" });
  }
};

export const savePriceKgPlan = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { entries } = req.body as {
      entries: {
        brandId: string;
        typeId: string;
        species: "PERRO" | "GATO" | "AMBOS";
        priceKg: number | null;
      }[];
    };

    await prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        if (entry.priceKg === null) {
          // Celda vacía → borrar si existe.
          await tx.priceKgPrice.deleteMany({
            where: {
              brandId: entry.brandId,
              typeId: entry.typeId,
              species: entry.species,
              organizationId,
            },
          });
          continue;
        }
        const priceKg = round2(entry.priceKg);
        const existing = await tx.priceKgPrice.findFirst({
          where: {
            brandId: entry.brandId,
            typeId: entry.typeId,
            species: entry.species,
            organizationId,
          },
          select: { id: true },
        });
        if (existing) {
          await tx.priceKgPrice.updateMany({
            where: {
              brandId: entry.brandId,
              typeId: entry.typeId,
              species: entry.species,
              organizationId,
            },
            data: { priceKg },
          });
        } else {
          await tx.priceKgPrice.create({
            data: {
              brandId: entry.brandId,
              typeId: entry.typeId,
              species: entry.species,
              priceKg,
              organizationId,
            },
          });
        }
      }
    });

    return res.status(200).json({ saved: entries.length });
  } catch (error: any) {
    console.error("Error guardando la planilla de precios por kg:", error);
    return res.status(400).json({ message: error.message });
  }
};

const priceKgPlanController = {
  getPriceKgPlan,
  savePriceKgPlan,
};
export default priceKgPlanController;
