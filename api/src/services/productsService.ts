import csvParser from "csv-parser";
import fs from "fs";
import { basePrisma } from "../config/db";

interface ProductInput {
  name: string;
  price: number;
  description: string;
  category: string;
  image: string;
  quantity: number;
}

/**
 * Resuelve el nombre de categoría (texto libre, viene del CSV o del form de
 * alta manual) a un Category.id de la organización. Crea la categoría si no
 * existe todavía (evita que el ADMIN tenga que precrearlas a mano).
 * Recibe basePrisma + organizationId explícito (no `prisma` con scope
 * automático) porque bulkAddProducts corre dentro de un callback de stream,
 * fuera del AsyncLocalStorage del request.
 */
export const resolveCategoryId = async (
  categoryName: string | undefined | null,
  organizationId: string,
): Promise<string | null> => {
  const name = categoryName?.trim();
  if (!name) return null;

  const existing = await basePrisma.category.findFirst({
    where: { organizationId, name },
  });
  if (existing) return existing.id;

  const created = await basePrisma.category.create({
    data: { name, organizationId },
  });
  return created.id;
};

/**
 * Carga masiva de productos desde un CSV, asignándolos a la organización dada.
 * Recibe el organizationId explícito porque el insert ocurre dentro de un
 * callback de stream (donde el contexto de tenant por AsyncLocalStorage puede
 * no estar disponible); por eso usamos basePrisma + organizationId explícito.
 */
export const bulkAddProducts = async (
  filePath: string,
  organizationId: string,
): Promise<void> => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`El archivo no existe en la ruta especificada: ${filePath}`);
  }

  return new Promise((resolve, reject) => {
    const rows: ProductInput[] = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row: any) => {
        rows.push({
          name: row.name,
          price: parseFloat(row.price),
          description: row.description,
          category: row.category,
          image: row.image,
          quantity: parseInt(row.quantity, 10),
        });
      })
      .on("end", async () => {
        try {
          // Categorías resueltas secuencialmente (no Promise.all) para que
          // nombres repetidos en el mismo CSV reusen la misma Category en vez
          // de crear duplicados por una carrera entre creates concurrentes.
          const products = [];
          for (const row of rows) {
            const categoryId = await resolveCategoryId(row.category, organizationId);
            products.push({
              name: row.name,
              price: row.price,
              description: row.description,
              categoryId,
              image: row.image,
              quantity: row.quantity,
              organizationId,
            });
          }
          await basePrisma.product.createMany({ data: products });
          resolve();
        } catch (error) {
          reject(error);
        }
      })
      .on("error", (error: any) => {
        reject(error);
      });
  });
};
