/**
 * Exporta las celdas sueltas con scaleCode a un CSV en el formato de importación
 * de Qendra (balanza Systel Cuora). Encabezado NO se incluye.
 *
 * Formato por fila (delimitado por ';'):
 *   Sección;Código PLU;Descripción;Número de PLU;Precio lista 1;Precio lista 2;Tipo de venta;Vencimiento;Ingredientes
 *
 * Reglas (doc Systel "Metodología para interconectar datos... Qendra"):
 *   - Descripción: máx 18 caracteres (conjunto ASCII de la Cuora).
 *   - Precio: decimal con coma (config regional AR), sin símbolo de moneda.
 *   - Tipo de venta: "peso".
 *   - Código PLU y Número PLU: usar el mismo número (recomendación Systel).
 *
 * Env:
 *   SECTION = nombre de la sección a usar (default "SUELTO")
 *   ORG_SLUG = slug de la organización (default el-almacen-de-las-mascotas)
 *
 * Usage (salida a stdout para redirigir a un archivo):
 *   npx ts-node scripts/export-scale-codes-csv.ts > scale-codes-qendra.csv
 */
import "dotenv/config";
import { basePrisma } from "../src/config/db";
import {
  buildDescription,
  buildRow,
  formatPrice,
  type CsvRow,
} from "../src/utils/scaleCsv";

const DEFAULT_ORG_SLUG = "el-almacen-de-las-mascotas";
const DEFAULT_SECTION = "SUELTO";

export const resolveOrgSlug = (env: NodeJS.ProcessEnv = process.env): string =>
  env.ORG_SLUG || DEFAULT_ORG_SLUG;

export const resolveSection = (env: NodeJS.ProcessEnv = process.env): string =>
  env.SECTION || DEFAULT_SECTION;

// buildDescription / formatPrice / buildRow viven en ../src/utils/scaleCsv
// (fuente única junto al endpoint GET /price-kg-plan/codes/csv).

export type { CsvRow } from "../src/utils/scaleCsv";

export function pushCsv(lines: string[]): void {
  process.stdout.write(lines.join("\n") + "\n");
}

async function main() {
  const slug = resolveOrgSlug();
  const section = resolveSection();

  const org = await basePrisma.organization.findFirst({ where: { slug } });
  if (!org) throw new Error(`Organización no encontrada (slug='${slug}')`);

  const [brands, types, cells] = await Promise.all([
    basePrisma.priceKgBrand.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } }),
    basePrisma.priceKgType.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } }),
    basePrisma.priceKgPrice.findMany({
      where: { organizationId: org.id, scaleCode: { not: null } },
      select: { id: true, brandId: true, typeId: true, species: true, priceKg: true, scaleCode: true },
    }),
  ]);

  const brandById = new Map(brands.map((b) => [b.id, b.name]));
  const typeById = new Map(types.map((t) => [t.id, t.name]));

  const rows = cells
    .filter((c) => c.scaleCode)
    .map((c) => {
      const brand = brandById.get(c.brandId) ?? "";
      const type = typeById.get(c.typeId) ?? "";
      return buildRow({
        section,
        code: c.scaleCode as string,
        description: buildDescription(brand, type, c.species),
        price: formatPrice(c.priceKg),
      });
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  pushCsv(rows);
  console.error(`\n${rows.length} filas exportadas (sección='${section}').`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("FATAL:", err);
      process.exit(1);
    })
    .finally(async () => {
      await basePrisma.$disconnect();
    });
}
