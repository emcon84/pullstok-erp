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
