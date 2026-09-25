import { Request, Response } from "express";
import {
  ManualProductError,
  createManualProduct as createManualProductService,
  listManualProducts as listManualProductsService,
  promoteManualProduct as promoteManualProductService,
} from "../services/manualProductService";
import { emitProductChanged } from "../realtime/socket";
import { requireOrganizationId } from "../config/tenantContext";

// Avisa al catálogo offline del front DESPUÉS de confirmada la mutación. Un
// fallo del socket nunca rompe la operación HTTP (mismo patrón que
// productController.notifyProductChanged).
const notifyProductChanged = (productId: string, action: "created" | "updated") => {
  try {
    emitProductChanged(requireOrganizationId(), productId, action);
  } catch (err: any) {
    console.error("[manualProductController] emitProductChanged falló:", err?.message ?? err);
  }
};

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof ManualProductError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
};

// POST /products/manual — body validado (name, price). Devuelve el producto con
// { id, name, price, quantity, category:{id,name}, ... } listo para el carrito.
const createManualProduct = async (req: Request, res: Response) => {
  try {
    const { name, price } = req.body as { name: string; price: number };
    const product = await createManualProductService({ name, price });
    notifyProductChanged(product.id, "created");
    return res.status(201).json(product);
  } catch (error) {
    return handleError(res, error, "Error al crear el producto manual");
  }
};

// GET /products/manual — lista admin de productos manuales pendientes.
const listManualProducts = async (_req: Request, res: Response) => {
  try {
    const products = await listManualProductsService();
    return res.status(200).json(products);
  } catch (error) {
    return handleError(res, error, "Error al listar los productos manuales");
  }
};

// POST /products/:id/promote — body validado (categoryId).
const promoteManualProduct = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.body as { categoryId: string };
    const product = await promoteManualProductService(req.params.id as string, categoryId);
    notifyProductChanged(req.params.id as string, "updated");
    return res.status(200).json(product);
  } catch (error) {
    return handleError(res, error, "Error al promover el producto manual");
  }
};

export default { createManualProduct, listManualProducts, promoteManualProduct };
