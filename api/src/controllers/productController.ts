import { Request, Response } from "express";
import { prisma } from "../config/db";
import { bulkAddProducts } from "../services/productsService";
import path from "path";
import fs from "fs";

// Create a new product
const createProduct = async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.create({
      data: req.body,
    });
    res.status(201).json(product);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Bulk upload products
const bulkUploadProducts = async (req: Request, res: Response) => {
  try {
    const products = req.body;
    if (!Array.isArray(products)) {
      return res
        .status(400)
        .json({ message: "Request body must be an array of products" });
    }

    const result = await prisma.product.createMany({ data: products });
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

  const filePath = req.file.path; // La ruta ya debe ser correcta

  try {
    console.log("Procesando archivo en:", filePath); // Log para verificar la ruta

    await bulkAddProducts(filePath);
    res.status(201).json({ message: "Products added successfully" });
  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ message: "Error processing file", error });
  }
};

// Get all products with optional filters
const getProducts = async (req: Request, res: Response) => {
  try {
    const { name, category, minPrice, maxPrice, description } = req.query;

    // Construct filter object
    let where: any = {};

    if (name) {
      where.name = { contains: name as string, mode: "insensitive" };
    }

    if (category) {
      where.category = category as string;
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
    const product = await prisma.product.findUnique({
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
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: req.body,
    });
    if (product) {
      res.status(200).json(product);
    } else {
      res.status(404).json({ message: "Product not found" });
    }
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Delete a product by ID
const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar si el producto está asociado a alguna orden
    const hasOrders = await prisma.orderItem.findFirst({
      where: { productId: id },
    });
    if (hasOrders) {
      return res
        .status(400)
        .json({
          message: "Cannot delete product because it has associated orders",
        });
    }

    // Verificar si el producto está asociado a algún presupuesto
    const hasBudgets = await prisma.quotationItem.findFirst({
      where: { productId: id },
    });
    if (hasBudgets) {
      return res
        .status(400)
        .json({
          message: "Cannot delete product because it has associated budgets",
        });
    }

    // Si el producto no está asociado a ninguna orden ni presupuesto, proceder a eliminar
    const result = await prisma.product.delete({ where: { id } });
    if (result) {
      res.status(200).json({ message: "Product deleted successfully" });
    } else {
      res.status(404).json({ message: "Product not found" });
    }
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
  deleteProduct,
};
