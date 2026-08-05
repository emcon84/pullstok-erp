import { Request, Response } from "express";
import { prisma, basePrisma } from "../config/db";
import { bulkAddProducts, resolveCategoryId } from "../services/productsService";
import {
  syncHqStock,
  canEditBranchStock,
  getStockSummary as getStockSummaryService,
} from "../services/stockService";
import { requireOrganizationId } from "../config/tenantContext";
import { AuthedRequest } from "../middlewares/authMiddleware";

/**
 * BranchIds del usuario leídos de la DB (design D3: la DB es la fuente de
 * verdad, el token nunca lo es — las asignaciones pueden cambiar a mitad de
 * sesión). BranchAssignment no es tenant-scoped (no tiene organizationId): el
 * filtro por userId es seguro y global.
 */
const readUserBranchIds = async (userId: string): Promise<string[]> => {
  const assignments = await basePrisma.branchAssignment.findMany({
    where: { userId },
    select: { branchId: true },
  });
  return assignments.map((a) => a.branchId);
};

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

    // Mantener ProductStock(HQ) sincronizado con el quantity del body (spec
    // D4): crear con quantity=10 deja ProductStock(HQ)=10 y Product.quantity=10.
    if (data.quantity !== undefined) {
      await syncHqStock(requireOrganizationId(), product.id, data.quantity);
    }

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

        if (rest.quantity !== undefined) {
          await syncHqStock(organizationId, product.id, rest.quantity);
        }

        results.push(product);
      } else {
        // No variants — use create directly
        const product = await prisma.product.create({
          data: { ...rest, categoryId: categoryId ?? null },
        });

        if (rest.quantity !== undefined) {
          await syncHqStock(organizationId, product.id, rest.quantity);
        }

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
    const { name, category, minPrice, maxPrice, description, branchId } = req.query;

    const where: any = {};

    if (name) {
      const searchTerm = name as string;
      // Split into words and search each — "Cat chow carne" matches
      // "CAT CHOW ADULTOS CARNE X 15 KG" even with words in between.
      const words = searchTerm.split(/\s+/).filter(w => w.length > 0);
      const variantMatch = (w: string) => ({
        variantAssignments: {
          some: {
            option: {
              value: { contains: w, mode: "insensitive" as const },
            },
          },
        },
      });
      if (words.length > 1) {
        where.AND = words.map(w => ({
          OR: [
            { name: { contains: w, mode: "insensitive" } },
            { code: { contains: w, mode: "insensitive" } },
            variantMatch(w),
          ],
        }));
      } else {
        where.OR = [
          { name: { contains: searchTerm, mode: "insensitive" } },
          { code: { contains: searchTerm, mode: "insensitive" } },
          variantMatch(searchTerm),
        ];
      }
    }
    if (category) {
      where.category = { name: { equals: category as string, mode: "insensitive" } };
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
    const include = {
      category: { select: { id: true, name: true } },
      variantAssignments: {
        include: {
          option: {
            include: { variant: { select: { id: true, name: true } } },
          },
        },
      },
      ...(branchId
        ? {
            stocks: {
              where: { branchId: branchId as string },
              select: { quantity: true },
            },
          }
        : {}),
    };

    // Paginación SERVER-SIDE opt-in (vendor dashboard). Solo se activa cuando
    // `page` y `pageSize` están presentes y son enteros positivos; si vienen
    // malformados o faltan, se mantiene el comportamiento legacy byte-for-byte
    // (array plano). Los llamadores existentes no cambian su shape.
    let page: number | undefined;
    let pageSize: number | undefined;

    const rawPage = Number(req.query.page);
    const rawPageSize = Number(req.query.pageSize);
    if (
      req.query.page !== undefined &&
      req.query.pageSize !== undefined &&
      Number.isInteger(rawPage) &&
      Number.isInteger(rawPageSize) &&
      rawPage > 0 &&
      rawPageSize > 0
    ) {
      page = rawPage;
      pageSize = rawPageSize;
    }

    if (page !== undefined && pageSize !== undefined) {
      // orderBy determinista para que skip/take no derive entre páginas (solo
      // afecta a la rama paginada — los llamadores legacy no se reordenan).
      const take = pageSize;
      const skip = (page - 1) * pageSize;

      const [items, total] = await Promise.all([
        prisma.product.findMany({ where, include, take, skip, orderBy: { name: "asc" } }),
        prisma.product.count({ where }),
      ]);

      res.status(200).json({
        items,
        total,
        page,
        pageSize,
        hasMore: skip + items.length < total,
      });
      return;
    }

    const products = await prisma.product.findMany({ where, include });
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

    // Sincronizar ProductStock(HQ) cuando la edición trae quantity (spec D4).
    if (data.quantity !== undefined) {
      await syncHqStock(requireOrganizationId(), req.params.id, data.quantity);
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
      where: {
        organizationId,
        OR: [{ code }, { barcode: code }],
      },
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

export const bulkPriceUpdate = async (req: Request, res: Response) => {
  try {
    const { brandValues, percentage, roundUp, categoryId } = req.body as {
      brandValues: string[];
      percentage: number;
      roundUp: boolean;
      categoryId?: string;
    };
    const dryRun = req.query.dryRun === "true";

    // Build where clause: products that have at least one of the selected brand options
    const where: any = {
      variantAssignments: {
        some: {
          option: {
            value: { in: brandValues },
            variant: { name: "Marca" },
          },
        },
      },
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    // Find all matching products
    const products = await prisma.product.findMany({
      where,
      select: { id: true, price: true, name: true },
    });

    if (products.length === 0) {
      return res.status(200).json({
        message: "No se encontraron productos con esas marcas",
        affected: 0,
        previousTotal: 0,
        newTotal: 0,
      });
    }

    const multiplier = 1 + (percentage / 100);
    const updates: { id: string; newPrice: number }[] = [];

    for (const p of products) {
      let newPrice = Number(p.price) * multiplier;
      if (roundUp) {
        const intPart = Math.floor(newPrice);
        const decPart = newPrice - intPart;
        if (decPart > 0.50) {
          newPrice = intPart + 1;
        } else {
          newPrice = intPart;
        }
      }
      updates.push({ id: p.id, newPrice: Math.round(newPrice * 100) / 100 });
    }

    const previousTotal = products.reduce((sum, p) => sum + Number(p.price), 0);
    const newTotal = updates.reduce((sum, u) => sum + u.newPrice, 0);

    if (!dryRun) {
      // Update all products in a transaction
      await prisma.$transaction(
        updates.map((u) =>
          prisma.product.updateMany({
            where: { id: u.id },
            data: { price: u.newPrice },
          })
        )
      );
    }

    res.status(200).json({
      message: dryRun
        ? `Preview: ${updates.length} productos serían actualizados`
        : `${updates.length} productos actualizados`,
      affected: updates.length,
      previousTotal: Math.round(previousTotal * 100) / 100,
      newTotal: Math.round(newTotal * 100) / 100,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /products/:id/stock — stock del producto en todas las sucursales ACTIVAS
 * de la org (spec A1). Respuesta autocontenida (design D5): no depende de
 * GET /branches (que es ADMIN/MANAGEMENT-only), cualquier rol autenticado la
 * puede leer. canEdit se calcula con el rol + BranchAssignment del usuario
 * (leído de la DB, fuente de verdad — design D3).
 */
export const getProductStock = async (req: AuthedRequest, res: Response) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const [branches, stocks, branchIds] = await Promise.all([
      prisma.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true, isHeadquarters: true },
      }),
      prisma.productStock.findMany({
        where: { productId: product.id },
        select: { branchId: true, quantity: true },
      }),
      readUserBranchIds(req.user!.id),
    ]);

    const stockByBranch = new Map(stocks.map((s) => [s.branchId, s.quantity]));

    res.status(200).json({
      productId: product.id,
      branches: branches.map((b) => ({
        branchId: b.id,
        branchName: b.name,
        quantity: stockByBranch.get(b.id) ?? 0,
        isHeadquarters: b.isHeadquarters,
        canEdit: canEditBranchStock(req.user!.role, branchIds, b.id),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /products/:id/stock/:branchId — actualiza el stock de UNA sucursal
 * (spec A2). Autorización server-side: ADMIN/MANAGEMENT editan cualquier
 * sucursal; VENDEDOR/CASHIER solo las suyas; el resto 403. BranchAssignment se
 * re-lee de la DB en CADA PUT (design D3 — el token no es fuente de verdad).
 * Si la sucursal es la casa central, sincroniza la columna legacy
 * Product.quantity (spec D4); las no-HQ NO la tocan.
 */
export const updateBranchStock = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { quantity } = req.body as { quantity: number };
    const { id, branchId } = req.params;

    const product = await prisma.product.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const branch = await prisma.branch.findFirst({
      where: { id: branchId, isActive: true },
      select: { id: true, isHeadquarters: true },
    });
    if (!branch) {
      return res.status(404).json({ message: "Sucursal no encontrada" });
    }

    // Autorización: rol + asignaciones FRESCAS de la DB (spec A2).
    const branchIds = await readUserBranchIds(req.user!.id);
    if (!canEditBranchStock(req.user!.role, branchIds, branchId)) {
      return res
        .status(403)
        .json({ message: "No tenés permiso para editar el stock de esta sucursal." });
    }

    // Upsert manual (updateMany count 0 → create): la fila de stock nace
    // on-first-write (sucursal sin fila previa queda en el valor indicado).
    const updated = await prisma.productStock.updateMany({
      where: { productId: id, branchId },
      data: { quantity },
    });
    if (updated.count === 0) {
      await prisma.productStock.create({
        data: { productId: id, branchId, quantity, organizationId },
      });
    }

    // D4: solo la casa central sincroniza la columna legacy Product.quantity.
    if (branch.isHeadquarters) {
      await syncHqStock(organizationId, id, quantity);
    }

    res.status(200).json({ message: "Stock actualizado", branchId, quantity });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * GET /products/stock-summary — resumen de stock de TODA la org: `total`
 * (suma de todos los ProductStock, incluye sucursales inactivas) + detalle por
 * sucursal ACTIVA (quantity por branch, 0 si no tiene filas). Cualquier rol
 * autenticado puede leerlo (mismo criterio que getProductStock). Usa prisma
 * (scope de tenant del request vía requireOrganizationId).
 */
export const getStockSummary = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const summary = await getStockSummaryService(organizationId);
    res.status(200).json(summary);
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
  bulkPriceUpdate,
  getProductStock,
  updateBranchStock,
  getStockSummary,
};
