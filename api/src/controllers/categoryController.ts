import { Response } from "express";
import CategoryService from "../services/categoryService";
import { AuthedRequest } from "../middlewares/authMiddleware";

/** ADMIN: alta masiva de categorías para SU organización (paso 2 del wizard). */
export const createCategories = async (req: AuthedRequest, res: Response) => {
  try {
    const categories = await CategoryService.bulkCreate(req.body.names);
    res.status(201).json(categories);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Lista las categorías de SU organización. */
export const getCategories = async (_req: AuthedRequest, res: Response) => {
  try {
    const categories = await CategoryService.list();
    res.status(200).json(categories);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/** ADMIN: renombra una categoría de SU organización. */
export const updateCategory = async (req: AuthedRequest, res: Response) => {
  try {
    const category = await CategoryService.rename(req.params.id, req.body.name);
    if (!category) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }
    res.status(200).json(category);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN: borra una categoría (sus productos quedan sin categoría). */
export const deleteCategory = async (req: AuthedRequest, res: Response) => {
  try {
    const count = await CategoryService.remove(req.params.id);
    if (count === 0) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }
    res.status(200).json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
