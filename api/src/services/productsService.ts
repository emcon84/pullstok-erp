// src/services/productService.ts
import csvParser from "csv-parser";
import fs from "fs";
import path from "path";
import { prisma } from "../config/db";

interface ProductInput {
  name: string;
  price: number;
  description: string;
  category: string;
  image: string;
  quantity: number;
}

// Ruta de la carpeta de uploads
const uploadDir = "/opt/render/project/uploads";

// Asegúrate de que la carpeta uploads exista
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export const bulkAddProducts = async (filePath: string): Promise<void> => {
  // Verificar si la carpeta 'uploads' existe, si no, crearla
  // El directorio ya debería existir en la ruta raíz del proyecto
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`Directorio creado: ${uploadDir}`);
  } else {
    console.log("Directorio ya existe:", uploadDir);
  }

  // Usar directamente el filePath proporcionado por req.file.path
  const fullPath = filePath;
  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `El archivo no existe en la ruta especificada: ${fullPath}`,
    );
  }

  return new Promise((resolve, reject) => {
    const products: ProductInput[] = [];

    fs.createReadStream(fullPath)
      .pipe(csvParser())
      .on("data", (row: any) => {
        const product: ProductInput = {
          name: row.name,
          price: parseFloat(row.price),
          description: row.description,
          category: row.category,
          image: row.image,
          quantity: parseInt(row.quantity, 10),
        };
        products.push(product);
      })
      .on("end", async () => {
        try {
          await prisma.product.createMany({ data: products });
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
