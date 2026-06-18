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
    const products: (ProductInput & { organizationId: string })[] = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row: any) => {
        products.push({
          name: row.name,
          price: parseFloat(row.price),
          description: row.description,
          category: row.category,
          image: row.image,
          quantity: parseInt(row.quantity, 10),
          organizationId,
        });
      })
      .on("end", async () => {
        try {
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
