import { Response } from "express";
import CategoryService from "../services/categoryService";
import { AuthedRequest } from "../middlewares/authMiddleware";

/** ADMIN: alta masiva de categorías para SU organización (paso 2 del wizard). */
export const createCategories = async (req: AuthedRequest, res: Response) => {
  try {
    const categories = await CategoryService.bulkCreate(
      req.body.names,
      req.body.parentId,
    );
    res.status(201).json(categories);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN: alta de una sola categoría (tree UI inline add). */
export const createCategory = async (req: AuthedRequest, res: Response) => {
  try {
    const category = await CategoryService.create(
      req.body.name,
      req.body.parentId,
    );
    res.status(201).json(category);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Devuelve el árbol de categorías en formato anidado (nested JSON). */
export const getTree = async (_req: AuthedRequest, res: Response) => {
  try {
    const tree = await CategoryService.getTree();
    res.status(200).json(tree);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
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

/** Devuelve los hijos directos de una categoría. */
export const getCategoryChildren = async (req: AuthedRequest, res: Response) => {
  try {
    const children = await CategoryService.getChildren(req.params.id);
    res.status(200).json(children);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN: renombra / mueve una categoría de SU organización. */
export const updateCategory = async (req: AuthedRequest, res: Response) => {
  try {
    const category = await CategoryService.rename(req.params.id, req.body);
    if (!category) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }
    res.status(200).json(category);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN: borra una categoría (sus productos quedan sin categoría, variantes en cascada). */
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

// =========================================================================
// Variant Definitions
// =========================================================================

/** List variant definitions + options for a category. */
export const getCategoryVariants = async (req: AuthedRequest, res: Response) => {
  try {
    const variants = await CategoryService.getVariants(req.params.id);
    res.status(200).json(variants);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Create a variant definition for a leaf category. */
export const createVariant = async (req: AuthedRequest, res: Response) => {
  try {
    const variant = await CategoryService.createVariant(
      req.params.id,
      req.body.name,
    );
    res.status(201).json(variant);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Rename a variant definition. */
export const updateVariant = async (req: AuthedRequest, res: Response) => {
  try {
    const variant = await CategoryService.updateVariant(req.params.id, req.body);
    if (!variant) {
      return res.status(404).json({ message: "Variante no encontrada" });
    }
    res.status(200).json(variant);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Delete a variant definition (cascade: options → productVariant). */
export const deleteVariant = async (req: AuthedRequest, res: Response) => {
  try {
    const count = await CategoryService.deleteVariant(req.params.id);
    if (count === 0) {
      return res.status(404).json({ message: "Variante no encontrada" });
    }
    res.status(200).json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// =========================================================================
// Variant Options
// =========================================================================

/** Create an option for a variant definition. */
export const createVariantOption = async (req: AuthedRequest, res: Response) => {
  try {
    const option = await CategoryService.createOption(
      req.params.id,
      req.body.value,
    );
    res.status(201).json(option);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Rename an option value. */
export const updateVariantOption = async (req: AuthedRequest, res: Response) => {
  try {
    const option = await CategoryService.updateOption(req.params.id, req.body);
    if (!option) {
      return res.status(404).json({ message: "Opción no encontrada" });
    }
    res.status(200).json(option);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Delete an option (cascade: productVariant). */
export const deleteVariantOption = async (req: AuthedRequest, res: Response) => {
  try {
    const count = await CategoryService.deleteOption(req.params.id);
    if (count === 0) {
      return res.status(404).json({ message: "Opción no encontrada" });
    }
    res.status(200).json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
