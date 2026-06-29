import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";

class CategoryService {
  /**
   * Alta masiva de categorías para la organización actual. Idempotente por
   * nombre: si ya existe una Category con ese nombre en la org, se reusa en
   * vez de duplicar (choca con @@unique([organizationId, name])).
   */
  static async bulkCreate(names: string[]) {
    const organizationId = requireOrganizationId();
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];

    const created = [];
    for (const name of unique) {
      const existing = await prisma.category.findFirst({ where: { name } });
      if (existing) {
        created.push(existing);
        continue;
      }
      created.push(
        await prisma.category.create({ data: { name, organizationId } }),
      );
    }
    return created;
  }

  static async list() {
    return prisma.category.findMany({ orderBy: { name: "asc" } });
  }

  /**
   * Renombra una categoría de la organización actual. Usa updateMany (el
   * cliente scopeado inyecta organizationId en el where → tenant-safe). Si no
   * existe en la org, devuelve null. Un nombre duplicado choca con
   * @@unique([organizationId, name]) y lanza (lo maneja el controller).
   */
  static async rename(id: string, name: string) {
    const res = await prisma.category.updateMany({
      where: { id },
      data: { name: name.trim() },
    });
    if (res.count === 0) return null;
    return prisma.category.findFirst({ where: { id } });
  }

  /**
   * Borra una categoría. Los productos que la usaban quedan SIN categoría
   * (categoryId = null), NO se borran. Devuelve la cantidad borrada (0 si no
   * existía en la org).
   */
  static async remove(id: string) {
    await prisma.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    });
    const res = await prisma.category.deleteMany({ where: { id } });
    return res.count;
  }
}

export default CategoryService;
