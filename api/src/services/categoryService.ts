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
}

export default CategoryService;
