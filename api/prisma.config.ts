import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Config de Prisma (reemplaza la propiedad `prisma` deprecada del package.json).
// OJO: con prisma.config.ts, Prisma NO carga el .env solo → lo hacemos arriba
// con `import "dotenv/config"`, si no se pierde DATABASE_URL.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  // Conexión para los comandos de Migrate / introspección.
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "ts-node prisma/seed.ts",
  },
});
