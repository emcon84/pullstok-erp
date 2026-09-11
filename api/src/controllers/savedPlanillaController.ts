/**
 * Planillas guardadas (saved planillas).
 *
 * Persistencia de un snapshot inmutable de la planilla mayorista o de la vista
 * previa de actualización de precios, para poder reabrirla/imprimirla desde otro
 * dispositivo. Tenant-scoped (organizationId) y en TENANT_MODELS (db.ts) → el
 * cliente `prisma` scopea automáticamente por org (anti-fuga). Por eso se usa
 * findFirst / findMany / deleteMany (nunca findUnique/update/delete).
 */

import { Request, Response } from "express";
import { requireOrganizationId } from "../config/tenantContext";
import { prisma } from "../config/db";

/**
 * POST /saved-planillas — guarda una planilla. El body ya viene validado por
 * `savePlanillaSchema` (type, title, rows). Devuelve el registro creado.
 */
export const createSavedPlanilla = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { type, title, rows } = req.body as {
      type: "MAYORISTA" | "ACTUALIZACION";
      title: string;
      rows: unknown[];
    };
    const created = await prisma.savedPlanilla.create({
      data: { organizationId, type, title, rows },
    });
    return res.status(201).json(created);
  } catch (error: any) {
    console.error("Error guardando planilla:", error);
    return res.status(500).json({ message: "Error al guardar la planilla" });
  }
};

/**
 * GET /saved-planillas — planillas de la org por createdAt desc. Devuelve
 * SOLO el resumen (sin el snapshot `rows`) para que el listado sea liviano.
 */
export const listSavedPlanillas = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const lists = await prisma.savedPlanilla.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, title: true, createdAt: true, rows: true },
    });
    const items = lists.map((l) => ({
      id: l.id,
      type: l.type,
      title: l.title,
      createdAt: l.createdAt,
      rowsCount: Array.isArray(l.rows) ? (l.rows as unknown[]).length : 0,
    }));
    return res.status(200).json({ items });
  } catch (error: any) {
    console.error("Error listando planillas guardadas:", error);
    return res.status(500).json({ message: "Error al listar las planillas guardadas" });
  }
};

/**
 * GET /saved-planillas/:id — planilla completa (con `rows`) de la org.
 * 404 si no existe o pertenece a otra org (findFirst con scope org).
 */
export const getSavedPlanilla = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { id } = req.params;
    const pl = await prisma.savedPlanilla.findFirst({
      where: { id, organizationId },
    });
    if (!pl) {
      return res.status(404).json({ message: "Planilla no encontrada" });
    }
    return res.status(200).json(pl);
  } catch (error: any) {
    console.error("Error obteniendo planilla guardada:", error);
    return res.status(500).json({ message: "Error al obtener la planilla guardada" });
  }
};

/**
 * DELETE /saved-planillas/:id — borra una planilla de la org (deleteMany con
 * scope org). 404 si no existe.
 */
export const deleteSavedPlanilla = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { id } = req.params;
    const result = await prisma.savedPlanilla.deleteMany({
      where: { id, organizationId },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Planilla no encontrada" });
    }
    return res.status(200).json({ deleted: true });
  } catch (error: any) {
    console.error("Error borrando planilla guardada:", error);
    return res.status(500).json({ message: "Error al borrar la planilla guardada" });
  }
};

const savedPlanillaController = {
  createSavedPlanilla,
  listSavedPlanillas,
  getSavedPlanilla,
  deleteSavedPlanilla,
};
export default savedPlanillaController;
