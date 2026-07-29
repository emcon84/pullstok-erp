import { Request, Response } from "express";
import { prisma, basePrisma } from "../config/db";
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
    const { categoryId, variantOptionIds, ...data } = req.body;
    const category = await prisma.category.findFirst({
      where: { id: categoryId },
    });
    if (!category) {
      return res
        .status(400)
        .json({ message: "La categoría indicada no existe" });
    }

    // Validate variantOptionIds belong to the category's variant definitions
    if (variantOptionIds && variantOptionIds.length > 0) {
      const validOptions = await prisma.categoryVariantOption.findMany({
        where: {
          id: { in: variantOptionIds },
          variant: { categoryId },
        },
      });
      if (validOptions.length !== variantOptionIds.length) {
        return res
          .status(400)
          .json({ message: "Algunas opciones de variante no pertenecen a esta categoría" });
      }
    }

    const product = await prisma.product.create({
      data: { ...data, categoryId },
    });

    // Create ProductVariant rows
    if (variantOptionIds && variantOptionIds.length > 0) {
      const orgId = requireOrganizationId();
      await prisma.productVariant.createMany({
        data: variantOptionIds.map((optionId: string) => ({
          productId: product.id,
          optionId,
          organizationId: orgId,
        })),
      });
    }

    // Return product with variant assignments
    const created = await prisma.product.findFirst({
      where: { id: product.id },
      include: {
        variantAssignments: {
          include: {
            option: {
              include: { variant: true },
            },
          },
        },
      },
    });

    res.status(201).json(created);
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
    const results = [];

    for (const { category, variantOptionIds, ...rest } of products) {
      const categoryId = await resolveCategoryId(category, organizationId);

      // If the product has variantOptionIds, create individually to
      // get the product ID back (createMany doesn't return IDs in PostgreSQL).
      if (variantOptionIds && variantOptionIds.length > 0) {
        // Validate options belong to the category
        if (categoryId) {
          const validOptions = await prisma.categoryVariantOption.findMany({
            where: {
              id: { in: variantOptionIds },
              variant: { categoryId },
            },
          });
          if (validOptions.length !== variantOptionIds.length) {
            console.warn(
              `[bulkUploadProducts] Skipping variant assignments for "${rest.name}": some options don't belong to category "${category}"`,
            );
          }
        }

        const product = await prisma.product.create({
          data: { ...rest, categoryId: categoryId ?? null },
        });

        if (variantOptionIds.length > 0 && categoryId) {
          await prisma.productVariant.createMany({
            data: variantOptionIds.map((optionId: string) => ({
              productId: product.id,
              optionId,
              organizationId,
            })),
          });
        }

        results.push(product);
      } else {
        // No variants — use create directly
        const product = await prisma.product.create({
          data: { ...rest, categoryId: categoryId ?? null },
        });
        results.push(product);
      }
    }

    res
      .status(201)
      .json({ message: "Products added successfully", data: results });
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
    const result = await bulkAddProducts(req.file.path, organizationId);
    res.status(201).json({
      message: `${result.count} productos importados`,
      count: result.count,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ message: "Error processing file", error });
  }
};

/**
 * GET /products/template-csv?category=Collares
 * Público — devuelve un CSV de plantilla con las columnas base + columnas de
 * variantes según la categoría indicada. Busca la categoría globalmente (sin
 * scope de org) porque la plantilla es solo nombres de columnas, no datos
 * sensibles.
 */
export const downloadTemplateCsv = async (req: Request, res: Response) => {
  try {
    const categoryName = req.query.category as string | undefined;
    const BASE_COLUMNS = ["name", "price", "description", "category", "image", "quantity"];
    let columns = [...BASE_COLUMNS];

    if (categoryName) {
      // Buscar categoría globalmente — la estructura de variantes es la misma
      // para cualquier org que tenga esa categoría.
      const category = await basePrisma.category.findFirst({
        where: { name: categoryName },
        include: {
          variantDefs: { orderBy: { name: "asc" } },
        },
      });

      if (category && category.variantDefs.length > 0) {
        for (const def of category.variantDefs) {
          columns.push(def.name);
        }
      }
    }

    // Add example row
    const exampleRow = ["Ejemplo Producto", "1500", "Descripción opcional", categoryName || "Collares", "", "10"];
    // Add example variant values for each variant column
    if (categoryName) {
      const exampleDefs = columns.length - BASE_COLUMNS.length;
      for (let i = 0; i < exampleDefs; i++) {
        exampleRow.push("valor de ejemplo");
      }
    }

    const csv = [columns.join(","), exampleRow.join(",")].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="plantilla-productos${categoryName ? "-" + categoryName.replace(/\s+/g, "-").toLowerCase() : ""}.csv"`,
    );
    res.status(200).send("\uFEFF" + csv); // BOM for Excel UTF-8
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Get all products with optional filters (scopeado por org vía extension)
const getProducts = async (req: Request, res: Response) => {
  try {
    const { name, category, minPrice, maxPrice, description } = req.query;

    const where: any = {};

    if (name) {
      const searchTerm = name as string;
      // Search by name OR code (for scanner lookup)
      where.OR = [
        { name: { contains: searchTerm, mode: "insensitive" } },
        { code: { contains: searchTerm, mode: "insensitive" } },
      ];
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

    const products = await prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        variantAssignments: {
          include: {
            option: {
              include: { variant: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
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
      include: {
        category: { select: { id: true, name: true } },
        variantAssignments: {
          include: {
            option: {
              include: { variant: { select: { id: true, name: true } } },
            },
          },
        },
      },
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
    const { variantOptionIds, ...data } = req.body;

    // If categoryId is changing, clear old variant assignments
    if (data.categoryId !== undefined) {
      const existing = await prisma.product.findFirst({
        where: { id: req.params.id },
        select: { categoryId: true },
      });
      if (existing && existing.categoryId !== data.categoryId) {
        await prisma.productVariant.deleteMany({
          where: { productId: req.params.id },
        });
      }
    }

    const result = await prisma.product.updateMany({
      where: { id: req.params.id },
      data,
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Handle variantOptionIds if provided
    if (variantOptionIds !== undefined) {
      // Clear existing
      await prisma.productVariant.deleteMany({
        where: { productId: req.params.id },
      });

      // Insert new ones
      if (variantOptionIds.length > 0) {
        const orgId = requireOrganizationId();
        await prisma.productVariant.createMany({
          data: variantOptionIds.map((optionId: string) => ({
            productId: req.params.id,
            optionId,
            organizationId: orgId,
          })),
        });
      }
    }

    const product = await prisma.product.findFirst({
      where: { id: req.params.id },
      include: {
        category: { select: { id: true, name: true } },
        variantAssignments: {
          include: {
            option: {
              include: { variant: { select: { id: true, name: true } } },
            },
          },
        },
      },
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

/**
 * GET /products/by-code/:code
 * Búsqueda rápida por código de barras / SKU.
 */
export const getProductByCode = async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const organizationId = requireOrganizationId();
    const product = await prisma.product.findFirst({
      where: { organizationId, code },
      include: {
        category: { select: { id: true, name: true } },
        variantAssignments: { include: { option: { include: { variant: true } } } },
      },
    });
    if (!product) return res.status(404).json({ message: "Producto no encontrado" });
    res.status(200).json(product);
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
