import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";

class CategoryService {
  /**
   * Alta masiva de categorías para la organización actual. Idempotente por
   * nombre: si ya existe una Category con ese nombre en la org, se reusa en
   * vez de duplicar (choca con @@unique([organizationId, name])).
   * Acepta parentId opcional para crear categorías hijas (SDD categories-variants-redesign).
   */
  static async bulkCreate(names: string[], parentId?: string) {
    const organizationId = requireOrganizationId();
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];

    // Validate parent exists in this org if parentId provided
    if (parentId) {
      const parent = await prisma.category.findFirst({
        where: { id: parentId },
      });
      if (!parent) {
        throw new Error("La categoría padre no existe");
      }
    }

    const created = [];
    for (const name of unique) {
      const existing = await prisma.category.findFirst({ where: { name } });
      if (existing) {
        // Update parentId if provided and different
        if (parentId && existing.parentId !== parentId) {
          await prisma.category.updateMany({
            where: { id: existing.id },
            data: { parentId },
          });
          const updated = await prisma.category.findFirst({
            where: { id: existing.id },
          });
          created.push(updated ?? existing);
        } else {
          created.push(existing);
        }
        continue;
      }
      created.push(
        await prisma.category.create({
          data: { name, organizationId, parentId: parentId ?? null },
        }),
      );
    }
    return created;
  }

  /**
   * Crea una única categoría. Acepta parentId opcional.
   */
  static async create(name: string, parentId?: string) {
    const organizationId = requireOrganizationId();
    if (parentId) {
      const parent = await prisma.category.findFirst({
        where: { id: parentId },
      });
      if (!parent) {
        throw new Error("La categoría padre no existe");
      }
    }
    return prisma.category.create({
      data: { name, organizationId, parentId: parentId ?? null },
    });
  }

  /**
   * Lista todas las categorías de la org, ordenadas para reconstrucción de árbol
   * client-side: roots first (por name), luego hijos agrupados bajo su padre.
   */
  static async list() {
    const all = await prisma.category.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        _count: {
          select: {
            children: true,
            variantDefs: true,
          },
        },
      },
    });

    // Sort: roots first (parentId null), then children grouped under their parent
    const roots = all.filter((c) => !c.parentId);
    const children = all.filter((c) => c.parentId);

    // Build ordered list: roots in alpha order, followed by children grouped by parent
    const result = [...roots];
    for (const root of result) {
      const rootChildren = children.filter((c) => c.parentId === root.id);
      result.push(...rootChildren);
    }
    return result;
  }

  /**
   * Devuelve el árbol completo de categorías en estructura anidada (nested JSON).
   * Cada nodo incluye su array `children` recursivamente.
   */
  static async getTree() {
    const all = await prisma.category.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        _count: {
          select: {
            children: true,
            variantDefs: true,
          },
        },
      },
    });

    // Build nested tree from flat list
    const map = new Map<string, any>();
    const roots: any[] = [];

    for (const cat of all) {
      map.set(cat.id, { ...cat, children: [] });
    }

    for (const cat of map.values()) {
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId).children.push(cat);
      } else {
        roots.push(cat);
      }
    }

    return roots;
  }

  /**
   * Devuelve los hijos directos de una categoría (sin recursión).
   */
  static async getChildren(id: string) {
    return prisma.category.findMany({
      where: { parentId: id },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Renombra y/o mueve una categoría.
   * - Solo se puede mover a una categoría raíz (parentId=null) o a otra raíz.
   * - No se permite mover a una categoría hoja (no-leaf rule).
   */
  static async rename(id: string, data: { name?: string; parentId?: string | null }) {
    // If parentId is being changed, validate target
    if (data.parentId !== undefined) {
      if (data.parentId !== null) {
        const targetParent = await prisma.category.findFirst({
          where: { id: data.parentId },
          include: { _count: { select: { children: true } } },
        });
        if (!targetParent) {
          throw new Error("La categoría destino no existe");
        }
        // Reject moving to self
        if (targetParent.id === id) {
          throw new Error("No se puede mover una categoría a sí misma");
        }
        // C5: reject moving to a leaf category (non-leaf parent requirement)
        // A leaf category has no children. Moving under a leaf would create
        // an invalid hierarchy since leaves are meant to hold variants.
        if (targetParent._count.children === 0) {
          throw new Error("No se puede mover una categoría debajo de una categoría hoja");
        }
        // Prevent circular: can't move to a descendant
        const isDescendant = await this.isDescendant(id, data.parentId);
        if (isDescendant) {
          throw new Error("No se puede mover a una categoría descendiente");
        }
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.parentId !== undefined) updateData.parentId = data.parentId;

    const res = await prisma.category.updateMany({
      where: { id },
      data: updateData,
    });
    if (res.count === 0) return null;
    return prisma.category.findFirst({ where: { id } });
  }

  /** Check if `childId` is a descendant of `parentId` (for circular move prevention) */
  private static async isDescendant(childId: string, parentId: string): Promise<boolean> {
    const children = await prisma.category.findMany({
      where: { parentId: childId },
      select: { id: true },
    });
    for (const child of children) {
      if (child.id === parentId) return true;
      if (await this.isDescendant(child.id, parentId)) return true;
    }
    return false;
  }

  /**
   * Borra una categoría y su cadena de variantes. Los productos que la usaban
   * quedan SIN categoría (categoryId = null). Cascade delete de
   * variantDefs → options → productVariant.
   */
  static async remove(id: string) {
    // Null out products referencing this category
    await prisma.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    });

    // Cascade delete product variants through the variant chain
    const variantDefs = await prisma.categoryVariantDefinition.findMany({
      where: { categoryId: id },
      select: { id: true },
    });
    for (const def of variantDefs) {
      const options = await prisma.categoryVariantOption.findMany({
        where: { variantId: def.id },
        select: { id: true },
      });
      for (const opt of options) {
        await prisma.productVariant.deleteMany({
          where: { optionId: opt.id },
        });
      }
      await prisma.categoryVariantOption.deleteMany({
        where: { variantId: def.id },
      });
    }
    await prisma.categoryVariantDefinition.deleteMany({
      where: { categoryId: id },
    });

    // Null out children's parentId
    await prisma.category.updateMany({
      where: { parentId: id },
      data: { parentId: null },
    });

    const res = await prisma.category.deleteMany({ where: { id } });
    return res.count;
  }

  // =========================================================================
  // Variant Definitions
  // =========================================================================

  /**
   * Devuelve las definiciones de variantes de una categoría, con sus opciones.
   */
  static async getVariants(categoryId: string) {
    // Verify category exists
    const category = await prisma.category.findFirst({
      where: { id: categoryId },
    });
    if (!category) {
      throw new Error("Categoría no encontrada");
    }
    return prisma.categoryVariantDefinition.findMany({
      where: { categoryId },
      orderBy: { sortOrder: "asc" },
      include: {
        options: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  }

  /**
   * Crea una definición de variante para una categoría hoja.
   * Rechaza si la categoría tiene hijos (no es hoja).
   */
  static async createVariant(categoryId: string, name: string) {
    // Verify category exists and is a leaf (no children)
    const category = await prisma.category.findFirst({
      where: { id: categoryId },
      include: { _count: { select: { children: true } } },
    });
    if (!category) {
      throw new Error("Categoría no encontrada");
    }
    if (category._count.children > 0) {
      throw new Error("Solo las categorías hoja pueden tener variantes");
    }

    const organizationId = requireOrganizationId();
    return prisma.categoryVariantDefinition.create({
      data: { categoryId, name: name.trim(), organizationId },
    });
  }

  static async updateVariant(id: string, data: { name?: string; sortOrder?: number }) {
    const res = await prisma.categoryVariantDefinition.updateMany({
      where: { id },
      data,
    });
    if (res.count === 0) return null;
    return prisma.categoryVariantDefinition.findFirst({ where: { id } });
  }

  /**
   * Borra una definición de variante. Cascade: options → productVariant.
   */
  static async deleteVariant(id: string) {
    // Delete product variant assignments linked to this variant's options
    const options = await prisma.categoryVariantOption.findMany({
      where: { variantId: id },
      select: { id: true },
    });
    for (const opt of options) {
      await prisma.productVariant.deleteMany({
        where: { optionId: opt.id },
      });
    }
    await prisma.categoryVariantOption.deleteMany({
      where: { variantId: id },
    });
    const res = await prisma.categoryVariantDefinition.deleteMany({
      where: { id },
    });
    return res.count;
  }

  // =========================================================================
  // Variant Options
  // =========================================================================

  static async createOption(variantId: string, value: string) {
    // Verify variant exists
    const variant = await prisma.categoryVariantDefinition.findFirst({
      where: { id: variantId },
    });
    if (!variant) {
      throw new Error("Definición de variante no encontrada");
    }

    const organizationId = requireOrganizationId();
    return prisma.categoryVariantOption.create({
      data: { variantId, value: value.trim(), organizationId },
    });
  }

  static async updateOption(id: string, data: { value?: string; sortOrder?: number }) {
    const res = await prisma.categoryVariantOption.updateMany({
      where: { id },
      data,
    });
    if (res.count === 0) return null;
    return prisma.categoryVariantOption.findFirst({ where: { id } });
  }

  /**
   * Borra una opción de variante. Cascade: productVariant.
   */
  static async deleteOption(id: string) {
    await prisma.productVariant.deleteMany({
      where: { optionId: id },
    });
    const res = await prisma.categoryVariantOption.deleteMany({
      where: { id },
    });
    return res.count;
  }
}

export default CategoryService;
