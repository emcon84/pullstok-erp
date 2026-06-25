import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getTenantContext } from "./tenantContext";

// Prisma 7: la conexión se hace vía driver adapter (pg). Cargamos dotenv arriba
// para que DATABASE_URL esté disponible al construir el adapter (en import).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Cliente base (sin scoping). Se usa para conectar y para operaciones de
// plataforma del SUPERADMIN (crear organizaciones, usuarios, login).
const basePrisma = new PrismaClient({ adapter });

// Modelos cuyos datos pertenecen a una organización (tenant-scoped).
// Counter queda FUERA a propósito: lo maneja secuenceService con su clave
// compuesta (organizationId + name) de forma explícita.
const TENANT_MODELS = new Set([
  "Product",
  "Category",
  "Customer",
  "Order",
  "Quotation",
  "Sale",
  "Receipt",
  "Invoice",
]);

/**
 * Cliente Prisma extendido que INYECTA automáticamente el organizationId del
 * request actual en toda operación sobre modelos tenant-scoped.
 *
 * Esto es el seguro anti-fuga: aunque un controller escriba `prisma.product
 * .findMany()` pelado, acá se le agrega `where: { organizationId }`. Si no hay
 * contexto de organización, la operación se bloquea (no devuelve datos de todos).
 */
const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) {
          return query(args);
        }

        const ctx = getTenantContext();
        const orgId = ctx?.organizationId;
        if (!orgId) {
          throw new Error(
            `Acceso a "${model}" sin contexto de organización. Operación bloqueada.`,
          );
        }

        const a: any = args ?? {};

        switch (operation) {
          case "findMany":
          case "findFirst":
          case "findFirstOrThrow":
          case "count":
          case "aggregate":
          case "groupBy":
          case "updateMany":
          case "deleteMany":
            a.where = { ...(a.where ?? {}), organizationId: orgId };
            return query(a);

          case "create":
            a.data = { ...(a.data ?? {}), organizationId: orgId };
            return query(a);

          case "createMany": {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            a.data = rows.map((row: any) => ({
              ...row,
              organizationId: orgId,
            }));
            return query(a);
          }

          // findUnique/update/delete (singulares, por clave única) NO se
          // permiten en modelos tenant: su `where` solo acepta campos únicos,
          // así que no se les puede agregar el filtro de organización y serían
          // una vía de fuga. Convención: usar findFirst / updateMany /
          // deleteMany (que sí reciben el scope automático de arriba).
          case "findUnique":
          case "findUniqueOrThrow":
          case "update":
          case "delete":
          case "upsert":
            throw new Error(
              `Operación "${operation}" no permitida en modelo multi-tenant "${model}". ` +
                `Usá findFirst / updateMany / deleteMany para que aplique el scope de organización.`,
            );

          default:
            return query(a);
        }
      },
    },
  },
});

const connectDB = async () => {
  try {
    await basePrisma.$connect();
    console.log("PostgreSQL connected via Prisma");
  } catch (error) {
    console.error("Error connecting to PostgreSQL:", error);
    process.exit(1);
  }
};

export default connectDB;
// `prisma` = cliente con scope automático de tenant (úsalo en los controllers
// de negocio). `basePrisma` = sin scope (solo auth/superadmin/plataforma).
export { prisma, basePrisma };
