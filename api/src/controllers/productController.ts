import { Request, Response } from "express";
import { prisma } from "../config/db";
import { bulkAddProducts, resolveCategoryId } from "../services/productsService";
import { requireOrganizationId } from "../config/tenantContext";

// Create a new product (organizationId lo inyecta la extension de Prisma).
// Alta manual: exige categoryId real (elegido de un <select>), no nombre.
// Se valida que la categoría exista y pertenezca a la org ANTES del create
// (findFirst, no findUnique — bloqueado por la extensión multi-tenant de
// db.ts) para no dejar reventar como error de FK 500 ni filtrar categoryId
// de otra organización.
const createProduct = async (req: Request, res: Response) => {
  try {
    const { categoryId, ...data } = req.body;
    const category = await prisma.category.findFirst({
      where: { id: categoryId },
    });
    if (!category) {
      return res
        .status(400)
        .json({ message: "La categoría indicada no existe" });
    }
    const product = await prisma.product.create({
      data: { ...data, categoryId },
    });
    res.status(201).json(product);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Bulk upload products (array en el body)
const bulkUploadProducts = async (req: Request, res: Response) => {
  try {
    const products = req.body;
    if (!Array.isArray(products)) {
      return res
        .status(400)
        .json({ message: "Request body must be an array of products" });
    }

    const organizationId = requireOrganizationId();
    // Secuencial (no Promise.all): si dos filas comparten nombre de categoría,
    // la segunda debe reusar la Category creada por la primera, no competir.
    const data = [];
    for (const { category, ...rest } of products) {
      const categoryId = await resolveCategoryId(category, organizationId);
      data.push({ ...rest, categoryId });
    }

    const result = await prisma.product.createMany({ data });
    res
      .status(201)
      .json({ message: "Products added successfully", data: result });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const uploadProductsCsv = async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    const organizationId = requireOrganizationId();
    await bulkAddProducts(req.file.path, organizationId);
    res.status(201).json({ message: "Products added successfully" });
  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ message: "Error processing file", error });
  }
};

// Get all products with optional filters (scopeado por org vía extension)
const getProducts = async (req: Request, res: Response) => {
  try {
    const { name, category, minPrice, maxPrice, description } = req.query;

    const where: any = {};

    if (name) {
      where.name = { contains: name as string, mode: "insensitive" };
    }
    if (category) {
      where.category = { name: category as string };
    }
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice as string);
      if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
    }
    if (description) {
      where.description = {
        contains: description as string,
        mode: "insensitive",
      };
    }

    const products = await prisma.product.findMany({ where });
    res.status(200).json(products);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Get a single product by ID
const getProductById = async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id },
    });
    if (product) {
      res.status(200).json(product);
    } else {
      res.status(404).json({ message: "Product not found" });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Update a product by ID
const updateProduct = async (req: Request, res: Response) => {
  try {
    const result = await prisma.product.updateMany({
      where: { id: req.params.id },
      data: req.body,
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    const product = await prisma.product.findFirst({
      where: { id: req.params.id },
    });
    res.status(200).json(product);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Toggle "Publicar en tienda" (WS4 — UI dedicada de Tienda/listado de
// productos). Acción de un solo campo, separada de updateProduct para que
// la UI pueda togglear sin mandar el resto del producto.
const publishProduct = async (req: Request, res: Response) => {
  try {
    const { publishedToStore } = req.body as { publishedToStore: boolean };
    const result = await prisma.product.updateMany({
      where: { id: req.params.id },
      data: { publishedToStore },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    const product = await prisma.product.findFirst({
      where: { id: req.params.id },
    });
    res.status(200).json(product);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Delete a product by ID
const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findFirst({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // No permitir borrar productos asociados a órdenes o presupuestos.
    const hasOrders = await prisma.orderItem.findFirst({
      where: { productId: id },
    });
    if (hasOrders) {
      return res.status(400).json({
        message: "Cannot delete product because it has associated orders",
      });
    }

    const hasBudgets = await prisma.quotationItem.findFirst({
      where: { productId: id },
    });
    if (hasBudgets) {
      return res.status(400).json({
        message: "Cannot delete product because it has associated budgets",
      });
    }

    await prisma.product.deleteMany({ where: { id } });
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export default {
  createProduct,
  bulkUploadProducts,
  getProducts,
  getProductById,
  updateProduct,
  publishProduct,
  deleteProduct,
};
