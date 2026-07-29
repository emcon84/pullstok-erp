import { Response } from "express";
import { prisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";

/** ADMIN/MANAGEMENT: crea una sucursal en SU organización. */
export const createBranch = async (req: AuthedRequest, res: Response) => {
  try {
    const branch = await prisma.branch.create({ data: req.body });
    res.status(201).json(branch);
  } catch (error: any) {
    if (error.message?.includes("Unique constraint")) {
      return res.status(400).json({ message: "Ya existe una sucursal con ese nombre" });
    }
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN/MANAGEMENT: lista las sucursales activas de SU organización. */
export const listBranches = async (_req: AuthedRequest, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
    });
    res.status(200).json(branches);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/** ADMIN/MANAGEMENT: actualiza una sucursal de SU organización. */
export const updateBranch = async (req: AuthedRequest, res: Response) => {
  try {
    const result = await prisma.branch.updateMany({
      where: { id: req.params.id },
      data: req.body,
    });

    if (result.count === 0) {
      return res.status(404).json({ message: "Sucursal no encontrada" });
    }

    const branch = await prisma.branch.findFirst({ where: { id: req.params.id } });
    res.status(200).json(branch);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN/MANAGEMENT: activa/desactiva una sucursal. */
export const toggleBranchActive = async (req: AuthedRequest, res: Response) => {
  try {
    const result = await prisma.branch.updateMany({
      where: { id: req.params.id },
      data: { isActive: Boolean(req.body.isActive) },
    });

    if (result.count === 0) {
      return res.status(404).json({ message: "Sucursal no encontrada" });
    }

    res.status(200).json({ message: "Sucursal actualizada" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN: elimina una sucursal (cascade borra assignments). */
export const deleteBranch = async (req: AuthedRequest, res: Response) => {
  try {
    const result = await prisma.branch.deleteMany({
      where: { id: req.params.id },
    });

    if (result.count === 0) {
      return res.status(404).json({ message: "Sucursal no encontrada" });
    }

    res.status(200).json({ message: "Sucursal eliminada" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
